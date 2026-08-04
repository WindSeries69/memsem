// Plugin opencode universel memsem.
// Activation : "plugin": ["memsem"] dans opencode.json — tout est automatique :
//  - enregistre le serveur MCP `memory` (npx -y memsem) si absent
//  - injecte memory-protocol.md et memory-index.md dans les instructions
//  - autorise ~/.memsem/** (extraction, index)
//  - extraction/consolidation/scoring de fond sur session.idle
// Copie autonome (fichier) : opencode-plugin/memsem-extract.ts (généré par build).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_DIR = join(homedir(), ".memsem");
const STATE_FILE = join(STATE_DIR, "extracted.json");
const PROTOCOL_FILE = join(STATE_DIR, "memory-protocol.md");
const INDEX_FILE = join(STATE_DIR, "memory-index.md");
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

type SessionClient = {
  session: {
    get: (p: { path: { id: string } }) => Promise<{ data?: { title?: string } }>;
    list: (p: { query: object }) => Promise<{ data?: Array<{ title?: string; parentID?: string }> }>;
    create: (p: { body: { title: string; parentID?: string } }) => Promise<{ data?: { id: string } }>;
    prompt: (p: { path: { id: string }; body: unknown }) => Promise<unknown>;
    messages: (p: { path: { id: string } }) => Promise<{ data?: Array<Record<string, unknown>> }>;
  };
};

type MessageInfo = { info?: Record<string, unknown>; parts?: Array<Record<string, unknown>> };

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

// Installe/copie le protocole dans ~/.memsem/ si le paquet fournit une copie à jour.
function ensureProtocol(): void {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const here = dirname(fileURLToPath(import.meta.url));
    const source = [join(here, "..", "memory-protocol.md"), join(here, "memory-protocol.md")].find((p) => existsSync(p));
    if (!source) return;
    const next = readFileSync(source, "utf8");
    if (!existsSync(PROTOCOL_FILE) || readFileSync(PROTOCOL_FILE, "utf8") !== next) {
      writeFileSync(PROTOCOL_FILE, next);
    }
  } catch {
    // l'installation du protocole est un confort : ne pas casser le plugin
  }
}

// Mode dry-run du juge : config ~/.memsem/config.json → { "judgeDryRun": true }.
function judgeDryRun(): boolean {
  try {
    const cfg = JSON.parse(readFileSync(join(STATE_DIR, "config.json"), "utf8")) as { judgeDryRun?: unknown };
    return cfg.judgeDryRun === true;
  } catch {
    return false;
  }
}

function buildTranscript(messages: MessageInfo[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const text = (message.parts ?? [])
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join(" ");
    if (text) lines.push(`${message.info?.role ?? "?"}: ${text}`);
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

const SCORE_PROMPT = (dryRun: boolean) => `Calibrage de priorité (memsem). Tu ajustes l'importance des mémoires par comparaisons par paires — le plus stable pour juger.

1. memory_list (limit 100) : lis les mémoires actives (importance, confiance, fréquence, thème).
2. Détecte les cas à recalibrer :
   - un pattern récurrent (fréquence >= 3, confiance >= 0.7) avec importance < 0.6 → sous-évalué ;
   - un fait contradictoire avec un fait critique (importance >= 0.8) dont l'importance est basse → à relever s'il gagne ;
   - deux mémoires de thèmes différents aux importances visiblement inversées par rapport à leur usage réel.
3. Compare PAR PAIRE : « laquelle compte le plus pour l'utilisateur ? » et ajuste via memory_score : gagnante +0.1, perdante -0.1.
4. RÈGLES DE SÛRETÉ : ne touche jamais une mémoire épinglée (pinned: true), ni une importance >= 0.9 ; ne monte jamais au-dessus de 0.85 ; ne descends jamais sous 0.4 ; sans preuve claire, ne change rien.
5. PASSE : passe le même passId à tous tes memory_score (ex: "juge-2026-08-04T10:00") — le plafond ±0.15 est cumulé par fait et par passe. Explique chaque ajustement via reason (ex: "paire: X bat Y").
6. Maximum 5 ajustements par passe. Réponds en une ligne : ce que tu as recalibré.
${dryRun ? "7. MODE DRY-RUN : passe dryRun: true sur chaque memory_score et n'applique RIEN. Réponds ce que tu aurais changé." : ""}`;

type MCPEntry = { type?: string; command?: string[]; enabled?: boolean };

// Vue minimale du config live passé au hook `config` (le vrai objet a plus de champs).
type CfgView = {
  small_model?: string;
  mcp?: Record<string, MCPEntry>;
  instructions?: string[];
  permission?: { external_directory?: Record<string, string> };
};

export default (async ({ client }: { client: SessionClient }) => {
  ensureProtocol();
  const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; kind: "extract" | "consolidate" | "score" }>();
  let smallModel: { providerID: string; modelID: string } | null = null;

  const resolveModel = async (sessionID: string): Promise<{ providerID: string; modelID: string } | null> => {
    if (smallModel) return smallModel;
    return findSessionModel(sessionID);
  };
  const hasAssistantReply = async (sessionID: string): Promise<boolean> => {
    const check = await client.session.messages({ path: { id: sessionID } });
    return (check.data ?? []).some((m) => {
      const info = m.info as Record<string, unknown> | undefined;
      return info?.role === "assistant" && !info?.error && (m.parts as unknown[] | undefined ?? []).length > 0;
    });
  };

  const findSessionModel = async (sessionID: string): Promise<{ providerID: string; modelID: string } | null> => {
    try {
      const result = await client.session.messages({ path: { id: sessionID } });
      const messages = result.data ?? [];
      const last = [...messages].reverse().find((m) => {
        const info = m.info as Record<string, unknown> | undefined;
        return info?.role === "assistant" && typeof info.providerID === "string" && typeof info.modelID === "string";
      });
      const info = last?.info as Record<string, unknown> | undefined;
      if (!info || typeof info.providerID !== "string" || typeof info.modelID !== "string") return null;
      return { providerID: info.providerID, modelID: info.modelID };
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
        const transcript = buildTranscript((result.data ?? []) as MessageInfo[]);
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
        console.error("[memsem] echec extraction:", String(err).slice(0, 300));
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
      console.error("[memsem] echec consolidation:", String(err).slice(0, 300));
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
          parts: [{ type: "text", text: SCORE_PROMPT(judgeDryRun()) }],
        },
      });
      if (await hasAssistantReply(created.data.id)) {
        const next = loadState();
        next.scoredAt = Date.now();
        saveState(next);
      }
    } catch (err) {
      console.error("[memsem] echec scoring:", String(err).slice(0, 300));
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
    config: async (cfg: Record<string, unknown>) => {
      const view = cfg as unknown as CfgView;
      if (typeof view.small_model === "string" && view.small_model.includes("/")) {
        const [providerID, modelID] = view.small_model.split("/");
        smallModel = { providerID, modelID };
      }
      // Serveur MCP : un seul, partagé par tous les projets.
      view.mcp ??= {};
      if (!view.mcp.memory) {
        view.mcp.memory = { type: "local", command: ["npx", "-y", "memsem"], enabled: true };
      }
      // Protocole + index : le cerveau est branché automatiquement.
      view.instructions ??= [];
      for (const file of [PROTOCOL_FILE, INDEX_FILE]) {
        if (!view.instructions.includes(file)) view.instructions.push(file);
      }
      // Permissions : extraction et index sans friction.
      view.permission ??= {};
      view.permission.external_directory ??= {};
      view.permission.external_directory["~/.memsem/**"] = "allow";
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
});
