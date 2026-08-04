import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cosine } from "../embed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.resolve(here, "../index.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-mcp-test-"));
const dbPath = path.join(tmpDir, "test.db");

async function call(client: Client, name: string, args: Record<string, unknown>) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return JSON.parse(text);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error("ECHEC:", message);
    process.exitCode = 1;
  } else {
    console.log("OK:", message);
  }
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverEntry],
  env: {
    ...process.env,
    MEMORY_DB_PATH: dbPath,
    MEMORY_PROJECT: "test-proj",
    OLLAMA_URL: "http://127.0.0.1:9",
  },
});

const client = new Client({ name: "test-client", version: "0.1.0" });
await client.connect(transport);

const add1 = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "boit",
  object: "lait",
  importance: 0.5,
  tags: ["alimentation"],
});
assert(add1.created === true, "ajout initial cree");

const add2 = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "boit",
  object: "lait",
  tags: ["recette"],
});
assert(add2.created === false && add2.conflict === false, "repetition renforce sans conflit");
assert(add2.confidence > add1.confidence, "confiance augmentee par repetition");
assert(add2.frequency === 2, "frequence incrementee");

const add3 = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "boit",
  object: "plus de lait (intolerance lactose)",
});
assert(add3.created === true && add3.conflict === true, "conflit doux: le nouveau fait coexiste");
assert(add3.faded.length === 1 && add3.archived.length === 0, "l'ancien s'estompe sans archivage immediat");

const coexisting = await call(client, "memory_search", { query: "lait", limit: 10 }) as Array<{
  predicate: string;
  object: string;
  score: number;
}>;
const boitRows = coexisting.filter((h) => h.predicate === "boit");
assert(boitRows.length === 2, "coexistence: les deux variantes boit->lait vivent");
const topBoit = boitRows.sort((a, b) => b.score - a.score)[0];
assert(topBoit.object.includes("intolerance"), "le nouveau fait est classe devant l'ancien");

const add3b = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "boit",
  object: "plus de lait (intolerance lactose)",
});
assert(add3b.archived.length === 1, "re-affirmation: l'ancien est archive sous le seuil");

const add4 = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "intolerant a",
  object: "lactose",
  importance: 0.9,
});
assert(add4.created === true, "fait important ponctuel cree");

const batch = await call(client, "memory_add_many", {
  facts: [
    { subject: "utilisateur", predicate: "adore", object: "the sans sucre", importance: 0.6, tags: ["boisson"] },
    { subject: "utilisateur", predicate: "evite", object: "gluten", importance: 0.5 },
  ],
});
assert(batch.length === 2 && batch.every((r: { created: boolean }) => r.created), "ajout par lot cree tout");
const batchHits = await call(client, "memory_search", { query: "the", limit: 10 }) as Array<{
  predicate: string;
  object: string;
}>;
assert(batchHits.some((h) => h.predicate === "adore" && h.object === "the sans sucre"), "lot retrouvable");

const hitsStrict = await call(client, "memory_search", { query: "lait", project: "test-proj", limit: 10 }) as Array<{
  predicate: string;
}>;
assert(
  hitsStrict.every((h) => h.predicate !== "intolerant a"),
  "stricte: pas de propagation sans relax",
);

const hits = await call(client, "memory_search", { query: "lait", project: "test-proj", relax: true, limit: 10 }) as Array<{
  id: number;
  predicate: string;
  object: string;
  score: number;
}>;
assert(hits.every((h) => h.predicate !== "boit" || h.object.includes("intolerance")), "l'ancien boit->lait ne remonte plus");
assert(hits.length >= 2, "recherche lait relax: nouvelle variante + intolerance via le graphe");
const intolerance = hits.find((h) => h.predicate === "intolerant a" && h.object === "lactose");
assert(!!intolerance && intolerance.score > 0, "relax: l'intolerance remonte sur une recherche lait via le graphe");

const resurrected = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "boit",
  object: "lait",
});
assert(
  resurrected.resurrected === true && resurrected.faded.length === 1 && resurrected.archived.length === 0,
  "tombstone: la valeur rejetee revient et estompe sa correction",
);
assert(
  resurrected.confidence < 0.5,
  "tombstone: la valeur rejetee revient avec une confiance basse",
);
const afterResurrect = await call(client, "memory_search", { query: "lait", project: "test-proj", limit: 10 }) as Array<{
  predicate: string;
  object: string;
}>;
const correction = afterResurrect.find((h) => h.predicate === "boit" && h.object.includes("intolerance"));
assert(!!correction, "tombstone: la correction reste vivante apres la re-affirmation");

const guard = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "a-pour-regle",
  object: "jamais de coca",
  pin: true,
});
assert(guard.created === true, "memoire epinglee creee");
const attack = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "a-pour-regle",
  object: "coca chaque jour",
});
assert(
  attack.faded.length === 0 && attack.archived.length === 0,
  "pin: la memoire epinglee survit a la contradiction",
);

const list = await call(client, "memory_list", { limit: 10 }) as Array<{
  importance: number;
  project: string;
  pinned: boolean;
}>;
const firstUnpinned = list.find((m) => !m.pinned);
assert(!!firstUnpinned && firstUnpinned.importance === 0.9, "priorite : l'important ponctuel bat le recurrent (apres les epinglees)");
assert(list.every((m) => m.project === "test-proj"), "filtre par projet");

const episode = await call(client, "memory_episode_add", {
  project: "test-proj",
  summary: "Session de test : cas lactose",
  provenance: "session-123",
});
assert(Number.isInteger(episode.id), "episode enregistre");

const chain = await call(client, "memory_add", {
  subject: "lactose",
  predicate: "est present dans",
  object: "fromage, yaourt, creme",
  tags: ["alimentation"],
});
assert(chain.created === true, "maillon de chaine cree");
const twoHop = await call(client, "memory_search", { query: "lait", relax: true, limit: 10 }) as Array<{
  subject: string;
  predicate: string;
  score: number;
}>;
const fromageHit = twoHop.find((h) => h.predicate === "est present dans");
assert(!!fromageHit && fromageHit.score > 0, "2 sauts: fromage atteint depuis lait via lactose");
const intolHit = twoHop.find((h) => h.predicate === "intolerant a");
assert(!!fromageHit && !!intolHit && fromageHit.score < intolHit.score, "l'activation decroit avec la distance");

await call(client, "memory_forget", { id: add4.id });
const afterForget = await call(client, "memory_search", { query: "intolerance", limit: 10 }) as Array<{ id: number }>;
assert(afterForget.every((h) => h.id !== add4.id), "memory_forget archive la memoire");

const pinned = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "priorise",
  object: "l economie de tokens",
  importance: 0.5,
  pin: true,
});
assert(pinned.created === true, "memoire creee");
const listPinned = await call(client, "memory_list", { limit: 20 }) as Array<{ pinned: boolean }>;
assert(listPinned[0].pinned === true, "pinning: l'epinglee est en tete de contexte");

const stats = await call(client, "memory_stats", {}) as { memoriesActive: number; pinned: number; edges: number };
assert(stats.memoriesActive >= 5 && stats.pinned >= 1 && stats.edges >= 2, "stats coherentes");

const themed = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "adore",
  object: "the",
  theme: "alimentation/boissons",
  project: "autre-projet",
});
assert(themed.created === true, "memoire thematisee creee");
const weakStrict = await call(client, "memory_search", { query: "the vert glace", limit: 10 }) as Array<{
  predicate: string;
  object: string;
}>;
assert(
  weakStrict.every((h) => !(h.predicate === "adore" && h.object === "the sans sucre")),
  "stricte: faible correspondance exclue (1 mot sur 3)",
);
const weakRelax = await call(client, "memory_search", { query: "the vert glace", relax: true, limit: 10 }) as Array<{
  predicate: string;
  object: string;
}>;
assert(
  weakRelax.some((h) => h.predicate === "adore" && h.object === "the sans sucre"),
  "relax: faible correspondance incluse",
);
const themeHits = await call(client, "memory_search", { query: "the", theme: "alimentation" }) as Array<{
  theme: string | null;
}>;
assert(
  themeHits.some((h) => h.theme === "alimentation/boissons"),
  "recherche theme parent: le sous-arbre est inclus",
);
const crossProject = await call(client, "memory_search", {
  query: "the",
  theme: "alimentation",
  project: "test-proj",
}) as Array<{ theme: string | null }>;
assert(
  crossProject.some((h) => h.theme === "alimentation/boissons"),
  "theme + projet: la memoire de l'autre projet ressort quand meme",
);
const themeList = await call(client, "memory_list", { theme: "alimentation" }) as Array<{ theme: string | null }>;
assert(themeList.every((h) => h.theme === "alimentation/boissons"), "liste par theme ciblee");
const themes = await call(client, "memory_themes", {}) as Array<{ theme: string; count: number }>;
assert(
  themes.some((t) => t.theme === "alimentation/boissons" && t.count >= 1),
  "carte des themes: la branche alimentation/boissons existe",
);

const indexResult = (await client.callTool({ name: "memory_index", arguments: {} })) as CallToolResult;
const index = (indexResult.content ?? [])
  .filter((c) => c.type === "text")
  .map((c) => c.text)
  .join("\n");
assert(
  index.includes("alimentation/boissons") && index.includes("the"),
  "index de routage: themes + mots-cles presents",
);

assert(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9, "cosinus: vecteurs identiques = 1");
assert(Math.abs(cosine([1, 0], [0, 1])) < 1e-9, "cosinus: vecteurs orthogonaux = 0");

const game = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "joue a",
  object: "the last of us",
  importance: 0.9,
  theme: "jeux/action",
  project: "test-proj",
});
assert(game.created === true, "memoire jeux a forte importance creee");
const noFocus = await call(client, "memory_search", { query: "the", limit: 10 }) as Array<{ predicate: string; object: string }>;
assert(noFocus[0].predicate === "joue a", "sans focus: la forte importance jeux domine");
const foodFocus = await call(client, "memory_search", { query: "the", focus: "alimentation", limit: 10 }) as Array<{ predicate: string; object: string }>;
assert(
  foodFocus[0].predicate !== "joue a",
  "focus alimentation: la memoire jeux s'efface malgre son importance",
);
const foodList = await call(client, "memory_list", { focus: "alimentation", limit: 10 }) as Array<{ theme: string | null; pinned: boolean }>;
assert(
  foodList[0].theme === "alimentation/boissons" || foodList[0].pinned === true,
  "liste focus: le theme focal est en tete (epinglees exceptees)",
);

const table = await call(client, "memory_add", {
  subject: "utilisateur",
  predicate: "cherche",
  object: "table en chene massif",
  importance: 0.7,
  theme: "maison/mobilier",
  project: "test-proj",
});
assert(table.created === true, "memoire mobilier creee");
const multiFocus = await call(client, "memory_search", {
  query: "the",
  focus: ["alimentation", "maison"],
  limit: 10,
}) as Array<{ predicate: string; theme: string | null; score: number }>;
const gameRank = multiFocus.findIndex((h) => h.predicate === "joue a");
const foodRank = multiFocus.findIndex((h) => h.theme === "alimentation/boissons");
assert(foodRank !== -1 && gameRank > foodRank, "multi-focus: la bouffe ne baisse pas quand un second theme s'ajoute");
const noTable = await call(client, "memory_search", {
  query: "the",
  focus: ["alimentation", "maison"],
  limit: 10,
}) as Array<{ predicate: string }>;
assert(
  noTable.find((h) => h.predicate === "cherche") === undefined,
  "la table sans le mot 'the' ne remonte pas par hasard",
);

await call(client, "memory_episode_add", {
  project: "test-proj",
  summary: "Discussion sur le concept d'un jeu de survie dinosaures",
  provenance: "session-dino",
});
await call(client, "memory_episode_add", {
  project: "autre-projet",
  summary: "Choix du stack TypeScript pour la memoire IA",
  provenance: "session-stack",
});
const epHits = await call(client, "memory_episode_search", { query: "dinosaures", limit: 10 }) as Array<{
  summary: string;
  project: string;
  score: number;
}>;
assert(
  epHits.length >= 1 && epHits[0].summary.includes("dinosaures") && epHits[0].score >= 0.5,
  "episodes: la recherche retrouve la session dinosaures",
);
const epList = await call(client, "memory_episode_search", { project: "test-proj", limit: 10 }) as Array<{ project: string }>;
assert(epList.length >= 2 && epList.every((e) => e.project === "test-proj"), "episodes: liste filtree par projet");

const scored = await call(client, "memory_score", { id: game.id, importance: 0.4 });
assert(scored.refused === "critical-0.9" && scored.applied === false, "scoring: fait critique (0.9) intouchable");
const scoredThe = await call(client, "memory_score", { id: themed.id, importance: 0.9, reason: "paire test", passId: "test-pass" });
assert(Math.abs(scoredThe.importance - 0.65) < 1e-9 && scoredThe.clampedDelta === true, "scoring: variation plafonnee ±0.15");
const dry = await call(client, "memory_score", { id: themed.id, importance: 0.5, dryRun: true });
assert(dry.applied === false, "scoring: dryRun sans effet");
const afterScore = await call(client, "memory_search", { query: "the", limit: 10 }) as Array<{ predicate: string; theme: string | null }>;
assert(
  afterScore.findIndex((h) => h.predicate === "joue a") === 0,
  "scoring: fait critique reste en tete malgre les tentatives",
);

await client.close();

const raw = new DatabaseSync(dbPath, { readOnly: true });
const superseded = raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE field = 'archived' AND reason = 'supersession'").get() as { n: number };
assert(superseded.n >= 1, "base: l'archivage par supersession est audite");
const resurrectedAudit = raw.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE reason = 'resurrection'").get() as { n: number };
assert(resurrectedAudit.n >= 1, "base: la resurrection tombstone est auditee");
const historyRows = raw.prepare("SELECT previous FROM memory_history").all() as Array<{ previous: string }>;
assert(historyRows.some((h) => h.previous === "lait"), "base: l'historique conserve l'ancien objet");
raw.close();
fs.rmSync(tmpDir, { recursive: true, force: true });

if (process.exitCode) {
  console.error("\nDes tests ont echoue.");
} else {
  console.log("\nTous les tests passent.");
}
