#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb } from "./db.js";
import { ollamaAvailable, EMBED_MODEL } from "./embed.js";

// Mode auto-installation : `npx -y memsem setup` configure l'hôte IA (opencode, claude).
if (process.argv[2] === "setup") {
  const { runSetup } = await import("./setup.js");
  await runSetup(process.argv.slice(3));
  process.exit(0);
}

const pkg = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const dbPath = process.env.MEMORY_DB_PATH ?? path.join(process.env.HOME ?? ".", ".memory-mcp", "memory.db");
const defaultProject = process.env.MEMORY_PROJECT ?? "global";
const indexPath = process.env.MEMSEM_INDEX_PATH ?? path.join(os.homedir(), ".memsem", "memory-index.md");

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
      "Écrit ou renforce un fait atomique (sujet → prédicat → objet). Si le même couple sujet/prédicat existe déjà dans le projet, la fréquence et la confiance augmentent ; si l'objet change, l'ancien est archivé dans l'historique (supersession).",
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
      pin: z.boolean().optional().describe("Épingle la mémoire : toujours en tête de contexte (memory_list)"),
    },
  },
  async ({ subject, predicate, object, importance, tags, theme, project, provenance, pin }) => {
    const result = add({
      subject,
      predicate,
      object,
      importance,
      tags,
      theme,
      project: project ?? defaultProject,
      provenance,
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
      })),
    );
    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
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
      project: z.string().optional().describe("Restreindre à un projet (ignoré si theme est fourni)"),
      theme: z.string().optional().describe("Filtre par thème (et ses sous-thèmes), ex: alimentation. Le thème traverse tous les projets (il prime sur project)"),
      focus: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Thèmes focaux de la conversation (liste vivante) : les mémoires d'un thème focal gardent leur score, les autres sont atténuées (×0.35). Ajoute un thème quand le sujet dévie, retire-le quand il retombe — ne baisse jamais un thème encore actif"),
      relax: z.boolean().optional().describe("false (défaut) : strict, lexical uniquement. true : associations par le graphe + index sémantique local (Ollama si présent)"),
      limit: z.number().int().min(1).max(100).optional().describe("Nombre max de résultats"),
    },
  },
  async ({ query, project, theme, focus, relax, limit }) => {
    const focuses = typeof focus === "string" ? [focus] : focus ?? null;
    const hits = await db.search(query, project ?? null, theme ?? null, limit ?? 10, relax ?? false, focuses);
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
      theme: z.string().optional().describe("Filtre par thème (et sous-thèmes), traverse tous les projets (prime sur project)"),
      focus: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Thèmes focaux : les mémoires des thèmes listés restent prioritaires, les autres sont atténuées"),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async ({ project, theme, focus, limit }) => {
    const focuses = typeof focus === "string" ? [focus] : focus ?? null;
    const hits = db.list(project ?? null, theme ?? null, limit ?? 20, focuses);
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
      model: EMBED_MODEL,
      embedded: db.memoriesWithoutEmbedding().length === 0 ? "all" : "partial",
    };
    return {
      content: [{ type: "text", text: JSON.stringify({ ...db.stats(), semantic }, null, 2) }],
    };
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
      "Ajuste l'importance d'une mémoire (calibrage par le sub-agent de scoring, comparaisons par paires). Ne pas utiliser pour écrire un fait — uniquement pour recalibrer.",
    inputSchema: {
      id: z.number().int().positive().describe("Identifiant de la mémoire"),
      importance: z.number().min(0).max(1).describe("Nouvelle importance (0..1)"),
    },
  },
  async ({ id, importance }) => {
    const result = db.setImportance(id, importance);
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

const transport = new StdioServerTransport();
await server.connect(transport);
