#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb } from "./db.js";
import { ollamaAvailable, EMBED_MODEL } from "./embed.js";

const dbPath = process.env.MEMORY_DB_PATH ?? path.join(process.env.HOME ?? ".", ".memory-mcp", "memory.db");

// Modes CLI : `npx -y memsem <commande>`.
if (process.argv[2] === "setup") {
  const { runSetup } = await import("./setup.js");
  await runSetup(process.argv.slice(3));
  process.exit(0);
}
if (["export", "import", "doctor", "list", "edit", "forget", "purge"].includes(process.argv[2])) {
  const { runCli } = await import("./cli.js");
  runCli(process.argv.slice(2), dbPath);
  process.exit(0);
}

const defaultProject = process.env.MEMORY_PROJECT ?? "global";
const indexPath = process.env.MEMSEM_INDEX_PATH ?? path.join(os.homedir(), ".memsem", "memory-index.md");

const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const db = new MemoryDb(dbPath);

function writeIndex(): void {
  try {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, db.indexMarkdown());
  } catch {
    // l'index est un confort : une erreur ne doit pas casser le serveur
  }
}

const add = (input: Parameters<typeof db.add>[0]) => {
  const result = db.add(input);
  void db.refreshEmbedding(result.id);
  writeIndex();
  return result;
};

writeIndex();

async function backfillEmbeddings(): Promise<void> {
  if (!(await ollamaAvailable())) return;
  for (const id of db.memoriesWithoutEmbedding()) {
    await db.refreshEmbedding(id);
  }
}
void backfillEmbeddings();

const server = new McpServer({
  name: "memsem",
  version: pkg.version,
});

server.registerTool(
  "memory_add",
  {
    title: "Ajouter une mémoire",
    description:
      "Écrit ou renforce un fait atomique (sujet → prédicat → objet), avec confiance, preuve et période de validité optionnelles. Une valeur rejetée par la revue humaine est bloquée à l'écriture.",
    inputSchema: {
      subject: z.string().min(1).describe("Le sujet du fait, ex: utilisateur, projet, module"),
      predicate: z.string().min(1).describe("Le prédicat, ex: boit, intolerant-a, preferer"),
      object: z.string().min(1).describe("L'objet du fait, ex: lait, lactose"),
      importance: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Importance intrinsèque 0..1 (défaut 0.5). 0.9+ = fait critique qui doit l'emporter"),
       tags: z.array(z.string()).optional().describe("Mots-clés pour la recherche lexicale"),
       theme: z.string().optional().describe("Thème hiérarchique, ex: alimentation/boissons. Sert de carte de routage : une recherche par thème traverse les projets"),
       project: z.string().optional().describe("Projet (défaut: global — la mémoire traverse tous les repos)"),
       provenance: z.string().optional().describe("Référence de la session d'origine"),
       trust: z.enum(["inferred", "verbatim"]).optional().describe("Niveau de confiance : inféré ou citation verbatim ; utilisez memory_verify pour verified"),
       evidence: z.string().max(2000).optional().describe("Preuve courte ou citation ayant motivé le fait"),
       validFrom: z.string().optional().describe("Début de validité ISO 8601, distinct de l'enregistrement"),
       validUntil: z.string().optional().describe("Fin de validité ISO 8601 exclusive"),
       pin: z.boolean().optional().describe("Épingle la mémoire : toujours en tête de contexte (memory_list)"),
    },
  },
  async ({ subject, predicate, object, importance, tags, theme, project, provenance, trust, evidence, validFrom, validUntil, pin }) => {
    const result = add({
      subject,
      predicate,
      object,
      importance,
      tags,
      theme,
       project: project ?? defaultProject,
       provenance,
       trust,
       evidence,
       validFrom,
       validUntil,
       pin,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_add_many",
  {
    title: "Ajouter plusieurs mémoires",
    description:
      "Écrit plusieurs faits atomiques en un seul appel (économie de tokens). Chaque entrée suit la même sémantique que memory_add.",
    inputSchema: {
      facts: z
        .array(
          z.object({
            subject: z.string().min(1),
            predicate: z.string().min(1),
            object: z.string().min(1),
             importance: z.number().min(0).max(1).optional(),
             tags: z.array(z.string()).optional(),
             theme: z.string().optional(),
             trust: z.enum(["inferred", "verbatim"]).optional(),
             evidence: z.string().max(2000).optional(),
             validFrom: z.string().optional(),
             validUntil: z.string().optional(),
          }),
        )
        .min(1),
      project: z.string().optional().describe("Projet (défaut: global — la mémoire traverse tous les repos)"),
      provenance: z.string().optional(),
    },
  },
  async ({ facts, project, provenance }) => {
    const results = db.addMany(
      facts.map((f) => ({
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        importance: f.importance,
        tags: f.tags,
         theme: f.theme,
         project: project ?? defaultProject,
         provenance,
         trust: f.trust,
         evidence: f.evidence,
         validFrom: f.validFrom,
         validUntil: f.validUntil,
      })),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_candidate_add",
  {
    title: "Proposer une mémoire à revue",
    description: "Place un fait en attente sans le rendre récupérable. Une revue humaine peut ensuite l'approuver ou le rejeter durablement.",
    inputSchema: {
      subject: z.string().min(1),
      predicate: z.string().min(1),
      object: z.string().min(1),
      importance: z.number().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      theme: z.string().optional(),
      project: z.string().optional(),
      provenance: z.string().optional(),
      trust: z.enum(["inferred", "verbatim"]).optional(),
      evidence: z.string().max(2000).optional(),
      validFrom: z.string().optional(),
      validUntil: z.string().optional(),
    },
  },
  async ({ subject, predicate, object, importance, tags, theme, project, provenance, trust, evidence, validFrom, validUntil }) => {
    const candidate = db.addCandidate({
      subject,
      predicate,
      object,
      importance,
      tags,
      theme,
      project: project ?? defaultProject,
      provenance,
      trust,
      evidence,
      validFrom,
      validUntil,
    });
    return { content: [{ type: "text", text: JSON.stringify(candidate) }] };
  },
);

server.registerTool(
  "memory_candidate_list",
  {
    title: "Lister les candidats mémoire",
    description: "Liste les faits en attente, approuvés ou rejetés sans les injecter dans la récupération normale.",
    inputSchema: {
      project: z.string().optional(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    },
  },
  async ({ project, status, limit }) => {
    const candidates = db.listCandidates(project ?? null, status ?? null, limit ?? 50);
    return { content: [{ type: "text", text: JSON.stringify(candidates, null, 2) }] };
  },
);

server.registerTool(
  "memory_candidate_review",
  {
    title: "Revoir un candidat mémoire",
    description: "Approuve un candidat et publie son évidence, ou le rejette et bloque sa réintroduction par la write gate.",
    inputSchema: {
      id: z.number().int().positive(),
      decision: z.enum(["approve", "reject"]),
      reason: z.string().max(500).optional(),
    },
  },
  async ({ id, decision, reason }) => {
    const result = db.reviewCandidate(id, decision, reason);
    if (result.memoryId !== null) void db.refreshEmbedding(result.memoryId);
    writeIndex();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  },
);

server.registerTool(
  "memory_verify",
  {
    title: "Vérifier une mémoire",
    description: "Marque une mémoire active comme vérifiée et remplace ou ajoute sa preuve courte. L'opération est auditée.",
    inputSchema: {
      id: z.number().int().positive(),
      evidence: z.string().min(1).max(2000).describe("Preuve humaine ou externe courte"),
      reason: z.string().max(500).optional(),
    },
  },
  async ({ id, evidence, reason }) => {
    const memory = db.verify(id, evidence, reason);
    if (!memory) return { content: [{ type: "text", text: JSON.stringify({ error: "mémoire introuvable ou archivée" }) }] };
    writeIndex();
    return { content: [{ type: "text", text: JSON.stringify(memory, null, 2) }] };
  },
);

server.registerTool(
  "memory_unsuppress",
  {
    title: "Réautoriser une valeur mémoire",
    description: "Retire une suppression durable après une décision explicite. La prochaine écriture pourra à nouveau être évaluée.",
    inputSchema: {
      subject: z.string().min(1),
      predicate: z.string().min(1),
      object: z.string().min(1),
      project: z.string().optional(),
    },
  },
  async ({ subject, predicate, object, project }) => {
    const removed = db.unsuppress(subject, predicate, object, project ?? defaultProject);
    return { content: [{ type: "text", text: JSON.stringify({ removed }) }] };
  },
);

server.registerTool(
  "memory_search",
  {
    title: "Chercher dans la mémoire",
    description:
      "Recherche stricte par défaut : seules les correspondances lexicales réelles (seuil 50% des mots de la requête) remontent, classées par priorité. Pas de propagation de graphe : avec une grande mémoire, on ne part pas dans les associations. relax=true : explore les associations par le graphe (2 sauts) — à n'utiliser que pour explorer, pas pour répondre.",
     inputSchema: {
       query: z.string().min(1).describe("Requête libre, ex: lait, intolérance, architecture"),
       project: z.string().optional().describe("Restreindre à un projet"),
       theme: z.string().optional().describe("Filtre par thème et sous-thèmes ; avec project, reste dans ce projet sauf crossProject=true"),
       crossProject: z.boolean().optional().describe("Avec un projet + thème, autorise explicitement la recherche inter-projets (défaut: false)"),
       focus: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Thèmes focaux de la conversation (liste vivante) : les mémoires d'un thème focal gardent leur score, les autres sont atténuées (×0.35). Ajoute un thème quand le sujet dévie, retire-le quand il retombe — ne baisse jamais un thème encore actif"),
       relax: z.boolean().optional().describe("false (défaut) : strict, lexical uniquement. true : associations par le graphe + index sémantique local (Ollama si présent)"),
       asOf: z.string().optional().describe("Rechercher l'état valide à une date ISO 8601 passée ou future"),
       limit: z.number().int().min(1).max(100).optional().describe("Nombre max de résultats"),
    },
  },
  async ({ query, project, theme, crossProject, focus, relax, asOf, limit }) => {
    const focuses = typeof focus === "string" ? [focus] : focus ?? null;
    const hits = await db.search(query, project ?? null, theme ?? null, limit ?? 10, relax ?? false, focuses, crossProject ?? false, asOf ?? null);
    return {
      content: [{ type: "text", text: JSON.stringify(hits, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_list",
  {
    title: "Lister les mémoires",
    description:
      "Liste les mémoires actives d'un projet et/ou d'un thème, triées par priorité (épinglées en tête). À utiliser pour injecter le contexte pertinent au démarrage d'une session ou au changement de sujet.",
    inputSchema: {
       project: z.string().optional(),
       theme: z.string().optional().describe("Filtre par thème et sous-thèmes ; avec project, reste dans ce projet sauf crossProject=true"),
       crossProject: z.boolean().optional().describe("Avec un projet + thème, autorise explicitement la liste inter-projets"),
       focus: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Thèmes focaux : les mémoires des thèmes listés restent prioritaires, les autres sont atténuées"),
       limit: z.number().int().min(1).max(100).optional(),
       asOf: z.string().optional().describe("Lister l'état valide à une date ISO 8601"),
    },
  },
  async ({ project, theme, crossProject, focus, asOf, limit }) => {
    const focuses = typeof focus === "string" ? [focus] : focus ?? null;
    const hits = db.list(project ?? null, theme ?? null, limit ?? 20, focuses, crossProject ?? false, asOf ?? null);
    return {
      content: [{ type: "text", text: JSON.stringify(hits, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_themes",
  {
    title: "Carte des thèmes",
    description:
      "L'arbre des thèmes avec leurs effectifs : la carte de routage de la mémoire. À charger au début de session pour savoir où chercher, puis rechercher par thème à chaque changement de sujet.",
    inputSchema: {},
  },
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(db.themes(), null, 2) }],
    };
  },
);

server.registerTool(
  "memory_stats",
  {
    title: "État de la mémoire",
    description:
      "Vue d'ensemble : compteurs (actives, archivées, épinglées, épisodes, arêtes du graphe), top des priorités et historique récent des changements.",
    inputSchema: {},
  },
  async () => {
    const semantic = {
      available: await ollamaAvailable(),
      model: EMBED_MODEL(),
      embedded: db.memoriesWithoutEmbedding().length === 0 ? "all" : "partial",
    };
    return {
      content: [{ type: "text", text: JSON.stringify({ ...db.stats(), semantic }, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_audit",
  {
    title: "Lire le journal d'audit",
    description: "Retourne les mutations, revues, dry-runs et purges avec leur raison, sans réexposer le contenu purgé.",
    inputSchema: {
      id: z.number().int().positive().optional().describe("Restreindre à une mémoire ou un candidat"),
      limit: z.number().int().min(1).max(1000).optional(),
    },
  },
  async ({ id, limit }) => {
    const entries = db.auditLog(id ?? null, limit ?? 50);
    return { content: [{ type: "text", text: JSON.stringify(entries, null, 2) }] };
  },
);

server.registerTool(
  "memory_index",
  {
    title: "Index de routage",
    description:
      "Régénère et renvoie l'index de la mémoire (fichier ~/.memsem/memory-index.md) : thèmes avec mots-clés, épinglées, faits sans thème. Le fichier est injecté automatiquement au début de chaque session — cet appel sert à le rafraîchir.",
    inputSchema: {},
  },
  async () => {
    writeIndex();
    return {
      content: [{ type: "text", text: db.indexMarkdown() }],
    };
  },
);

server.registerTool(
  "memory_episode_search",
  {
    title: "Chercher dans les épisodes",
    description:
      "Recherche dans les résumés de sessions (la couche temporelle) : « qu'est-ce qu'on a fait la semaine dernière ? », « de quoi a-t-on parlé sur ce projet ? ». Sans query, liste les épisodes récents. Même seuil strict que la recherche de mémoires.",
    inputSchema: {
      query: z.string().optional().describe("Mots-clés sur le résumé de la session"),
      project: z.string().optional().describe("Restreindre à un projet"),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ query, project, limit }) => {
    const hits = db.episodeSearch(query ?? null, project ?? null, limit ?? 10);
    return {
      content: [{ type: "text", text: JSON.stringify(hits, null, 2) }],
    };
  },
);

server.registerTool(
  "memory_episode_add",
  {
    title: "Enregistrer un épisode",
    description:
      "Enregistre un épisode de session (résumé épisodique + provenance). À appeler à la fin d'une conversation : l'historique des sessions alimente la consolidation future.",
    inputSchema: {
      project: z.string().optional(),
      summary: z.string().min(1).describe("Résumé de la session en une phrase"),
      provenance: z.string().optional().describe("Identifiant de la session source"),
    },
  },
  async ({ project, summary, provenance }) => {
    const episode = db.addEpisode({ project: project ?? defaultProject, summary, provenance });
    return {
      content: [{ type: "text", text: JSON.stringify(episode) }],
    };
  },
);

server.registerTool(
  "memory_score",
  {
    title: "Recalibrer l'importance",
    description:
      "Ajuste l'importance d'une mémoire (calibrage par le sub-agent de scoring, comparaisons par paires). Garde-fous : faits épinglés et importance ≥ 0.9 intouchables, variation plafonnée à ±0.15 (par appel et par passe cumulée via passId), bornes 0.4–0.85. dryRun: true logue sans appliquer. Ne pas utiliser pour écrire un fait — uniquement pour recalibrer.",
    inputSchema: {
      id: z.number().int().positive().describe("Identifiant de la mémoire"),
      importance: z.number().min(0).max(1).describe("Importance cible (0..1), plafonnée à ±0.15 de la valeur actuelle"),
      dryRun: z.boolean().optional().describe("true : journalise le changement prévu sans l'appliquer"),
      reason: z.string().optional().describe("Pourquoi (journal d'audit), ex: 'paire: X bat Y'"),
      passId: z.string().optional().describe("Identifiant de la passe du juge : cumule le plafond ±0.15 sur toute la passe"),
    },
  },
  async ({ id, importance, dryRun, reason, passId }) => {
    const result = db.setImportance(id, importance, { dryRun, reason, passId });
    if (!result) {
      return { content: [{ type: "text", text: JSON.stringify({ error: "memoire introuvable ou archivee" }) }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  },
);

server.registerTool(
  "memory_forget",
  {
    title: "Oublier une mémoire",
    description: "Archive une mémoire (elle ne remonte plus dans les recherches, mais reste en base).",
    inputSchema: {
      id: z.number().int().positive().describe("Identifiant de la mémoire"),
    },
  },
  async ({ id }) => {
    const forgotten = db.forget(id);
    return {
      content: [{ type: "text", text: JSON.stringify({ id, forgotten }) }],
    };
  },
);

server.registerTool(
  "memory_purge",
  {
    title: "Purger une mémoire",
    description: "Supprime définitivement le contenu d'une mémoire et ses historiques. Requiert confirm=true ; l'audit conserve uniquement une trace redacted.",
    inputSchema: {
      id: z.number().int().positive(),
      confirm: z.literal(true).describe("Confirmation explicite de la suppression irréversible"),
      reason: z.string().max(500).optional(),
    },
  },
  async ({ id, reason }) => {
    const purged = db.purge(id, reason ?? "mcp-purge");
    writeIndex();
    return { content: [{ type: "text", text: JSON.stringify({ id, purged }) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
