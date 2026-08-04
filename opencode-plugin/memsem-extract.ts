import type { Plugin } from "@opencode-ai/plugin";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".memsem");
const STATE_FILE = join(STATE_DIR, "extracted.json");
const EXTRACT_TITLE = "memsem-extract";
const CONSOLIDATE_TITLE = "memsem-consolidate";
const SCORE_TITLE = "memsem-score";
const DEBOUNCE_MS = 90_000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_CHARS = 12_000;

const MINIMAL_SYSTEM = "Tu es un sub-agent de gestion de mémoire memsem. Exécute exactement la tâche de l'utilisateur avec les outils à ta disposition. Réponds de manière minimale et factuelle.";

interface State {
  extracted: string[];
  consolidatedAt: number;
  scoredAt: number;
}

function loadState(): State {
  if (!existsSync(STATE_FILE)) return { extracted: [], consolidatedAt: 0, scoredAt: 0 };
  try {
    const raw = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    if (Array.isArray(raw)) return { extracted: raw, consolidatedAt: 0, scoredAt: 0 };
    return {
      extracted: raw.extracted ?? [],
      consolidatedAt: raw.consolidatedAt ?? 0,
      scoredAt: raw.scoredAt ?? 0,
    };
  } catch {
    return { extracted: [], consolidatedAt: 0, scoredAt: 0 };
  }
}

function saveState(state: State): void {
  mkdirSync(STATE_DIR, { recursive: true });
  const current = loadState();
  writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...state }, null, 2));
}

function markExtracted(state: State, sessionID: string): void {
  if (!state.extracted.includes(sessionID)) {
    state.extracted.push(sessionID);
    saveState(state);
  }
}

function buildTranscript(messages: Array<{ info: { role: string }; parts: Array<{ type?: string; text?: string }> }>): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = (message.parts ?? [])
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text)
      .join(" ");
    if (text) lines.push(`${message.info.role}: ${text}`);
  }
  return lines.slice(-MAX_MESSAGES).join("\n").slice(-MAX_CHARS);
}

const EXTRACT_PROMPT = (transcript: string, sessionID: string) => `Extraction de mémoire (memsem).

Relis cette conversation et extrais-en les FAITS DURABLES (préférences, décisions, contraintes, faits projet/utilisateur). Pour chaque fait, écris un triplet atomique via memory_add_many : { subject, predicate, object, importance (0.5 courant, 0.6-0.7 décision, 0.9 critique), theme (hiérarchique, ex: alimentation/boissons), tags }. Réécrire un triplet déjà existant est voulu (ça renforce sa confiance). N'écris PAS l'éphémère (commandes, contenus de fichiers, étapes ponctuelles). Termine par memory_episode_add (summary: résumé en une phrase, provenance: "${sessionID}") puis memory_index pour régénérer l'index de session.

Conversation :
${transcript}`;

const CONSOLIDATE_PROMPT = `Consolidation de mémoire (memsem). Tu es l'hippocampe : tu fusionnes les petits faits en patterns plus généraux, en ne perdant jamais l'accès.

1. memory_list (limit 100) pour voir les mémoires actives.
2. Détecte des groupes de petits faits qui se ressemblent (même sujet, prédicats proches, ou mêmes mots-clés). Groupe convaincant = au moins 2 faits.
3. Pour chaque groupe, écris un pattern consolidé via memory_add : subject "utilisateur", prédicat synthétique, objet généralisant, importance 0.6, theme = thème des faits, tags = TOUS les mots-clés des petits faits (c'est ce qui rend le pattern retrouvable).
4. RÈGLE DE SÛRETÉ : pour CHAQUE petit fait que tu veux archiver, rejoue memory_search avec 2 de ses mots-clés (strict). Le pattern consolidé doit remonter dans les 5 premiers résultats. Sinon N'ARCHIVE PAS ce fait : il reste vivant.
5. N'archive jamais : un fait critique (importance >= 0.8), une mémoire épinglée (pinned: true), un fait qui contredit une mémoire critique (edge contradicts) — en cas de doute, ne touche pas.
6. memory_forget sur les petits faits uniquement si la vérification du point 4 passe.
7. Maximum 3 consolidations par passe. Réponds en une ligne : ce que tu as fusionné et archivé.`;

const SCORE_PROMPT = `Calibrage de priorité (memsem). Tu ajustes l'importance des mémoires par comparaisons par paires — le plus stable pour juger.

1. memory_list (limit 100) : lis les mémoires actives (importance, confiance, fréquence, thème).
2. Détecte les cas à recalibrer :
   - un pattern récurrent (fréquence >= 3, confiance >= 0.7) avec importance < 0.6 → sous-évalué ;
   - un fait contradictoire avec un fait critique (importance >= 0.8) dont l'importance est basse → à relever s'il gagne ;
   - deux mémoires de thèmes différents aux importances visiblement inversées par rapport à leur usage réel.
3. Compare PAR PAIRE : « laquelle compte le plus pour l'utilisateur ? » et ajuste via memory_score : gagnante +0.1, perdante -0.1.
4. RÈGLES DE SÛRETÉ : ne touche jamais une mémoire épinglée (pinned: true), ni une importance >= 0.9 ; ne monte jamais au-dessus de 0.85 ; ne descends jamais sous 0.4 ; sans preuve claire, ne change rien.
5. Maximum 5 ajustements par passe. Réponds en une ligne : ce que tu as recalibré.`;

export default (async ({ client }) => {
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; kind: "extract" | "consolidate" | "score" }>();
  let smallModel: { providerID: string; modelID: string } | null = null;

  const resolveModel = async (sessionID: string): Promise<{ providerID: string; modelID: string } | null> => {
    if (smallModel) return smallModel;
    return findSessionModel(sessionID);
  };
  const hasAssistantReply = async (sessionID: string): Promise<boolean> => {
    const check = await client.session.messages({ path: { id: sessionID } });
    return (check.data ?? []).some(
      (m: { info?: { role?: string; error?: unknown }; parts?: Array<{ type?: string }> }) =>
        m.info?.role === "assistant" && !m.info.error && (m.parts ?? []).length > 0,
    );
  };

  const findSessionModel = async (sessionID: string): Promise<{ providerID: string; modelID: string } | null> => {
    try {
      const result = await client.session.messages({ path: { id: sessionID } });
      const messages = (result.data ?? []) as Array<{
        info: { role?: string; providerID?: string; modelID?: string };
      }>;
      const last = [...messages].reverse().find((m) => m.info?.role === "assistant" && m.info?.providerID && m.info?.modelID);
      return last ? { providerID: last.info.providerID!, modelID: last.info.modelID! } : null;
    } catch {
      return null;
    }
  };

  const extractExists = async (sessionID: string): Promise<boolean> => {
    const list = await client.session.list({ query: {} }).catch(() => null);
    if (!list?.data) return false;
    return list.data.some((s) => s.title === EXTRACT_TITLE && s.parentID === sessionID);
  };

  const run = async (sessionID: string, kind: "extract" | "consolidate" | "score") => {
    const state = loadState();
    const model = await resolveModel(sessionID);
    if (kind === "extract") {
      if (state.extracted.includes(sessionID)) return;
      if (await extractExists(sessionID)) return;
      try {
        const result = await client.session.messages({ path: { id: sessionID } });
        const transcript = buildTranscript(
          (result.data ?? []) as Array<{ info: { role: string }; parts: Array<{ type?: string; text?: string }> }>,
        );
        if (transcript.length < 200) {
          markExtracted(loadState(), sessionID);
          return;
        }
        const created = await client.session.create({
          body: { title: EXTRACT_TITLE, parentID: sessionID },
        });
        if (!created.data) return;
        await client.session.prompt({
          path: { id: created.data.id },
          body: {
            agent: "general",
            model: model ?? undefined,
            system: MINIMAL_SYSTEM,
            tools: {
              memory_add: true,
              memory_add_many: true,
              memory_episode_add: true,
              memory_search: true,
              memory_index: true,
            },
            parts: [{ type: "text", text: EXTRACT_PROMPT(transcript, sessionID) }],
          },
        });
        if (await hasAssistantReply(created.data.id)) markExtracted(loadState(), sessionID);
      } catch (err) {
        console.error("[memsem-extract] echec extraction:", String(err).slice(0, 300));
      }
      return;
    }

    if (Date.now() - state.consolidatedAt < INTERVAL_MS) return;
    try {
      const created = await client.session.create({ body: { title: CONSOLIDATE_TITLE } });
      if (!created.data) return;
      await client.session.prompt({
        path: { id: created.data.id },
        body: {
          agent: "general",
          model: model ?? undefined,
          system: MINIMAL_SYSTEM,
          tools: {
            memory_list: true,
            memory_search: true,
            memory_add: true,
            memory_forget: true,
          },
          parts: [{ type: "text", text: CONSOLIDATE_PROMPT }],
        },
      });
      if (await hasAssistantReply(created.data.id)) {
        const next = loadState();
        next.consolidatedAt = Date.now();
        saveState(next);
      }
    } catch (err) {
      console.error("[memsem-extract] echec consolidation:", String(err).slice(0, 300));
    }
    return;
  };

  const runScore = async (sessionID: string) => {
    const state = loadState();
    if (Date.now() - state.scoredAt < INTERVAL_MS) return;
    const model = await resolveModel(sessionID);
    try {
      const created = await client.session.create({ body: { title: SCORE_TITLE } });
      if (!created.data) return;
      await client.session.prompt({
        path: { id: created.data.id },
        body: {
          agent: "general",
          model: model ?? undefined,
          system: MINIMAL_SYSTEM,
          tools: {
            memory_list: true,
            memory_search: true,
            memory_score: true,
          },
          parts: [{ type: "text", text: SCORE_PROMPT }],
        },
      });
      if (await hasAssistantReply(created.data.id)) {
        const next = loadState();
        next.scoredAt = Date.now();
        saveState(next);
      }
    } catch (err) {
      console.error("[memsem-extract] echec scoring:", String(err).slice(0, 300));
    }
  };

  const schedule = (sessionID: string, kind: "extract" | "consolidate" | "score") => {
    const key = `${sessionID}:${kind}`;
    const existing = pending.get(key);
    if (existing) clearTimeout(existing.timer);
    pending.set(key, {
      kind,
      timer: setTimeout(() => {
        pending.delete(key);
        if (kind === "score") void runScore(sessionID);
        else void run(sessionID, kind);
      }, DEBOUNCE_MS),
    });
  };

  return {
    config: async (cfg: { small_model?: string }) => {
      if (typeof cfg.small_model === "string" && cfg.small_model.includes("/")) {
        const [providerID, modelID] = cfg.small_model.split("/");
        smallModel = { providerID, modelID };
      }
    },
    event: async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
      if (input.event.type !== "session.idle") return;
      const sessionID = input.event.properties?.sessionID as string | undefined;
      if (!sessionID) return;
      const info = await client.session.get({ path: { id: sessionID } }).catch(() => null);
      const title = info?.data?.title;
      if (title === EXTRACT_TITLE || title === CONSOLIDATE_TITLE || title === SCORE_TITLE) return;
      schedule(sessionID, "extract");
      schedule(sessionID, "consolidate");
      schedule(sessionID, "score");
    },
  };
}) satisfies Plugin;
