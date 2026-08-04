#!/usr/bin/env node
// Banc d'essai memsem : 50 faits, 20 requêtes avec résultats attendus.
// Mesure precision@k / recall@k de la recherche stricte, pour plusieurs jeux de
// constantes. Hors ligne (pas d'Ollama) et déterministe.
// Usage : npm run build && node scripts/bench.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "../dist/db.js";
import { resetConfig } from "../dist/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// [label, subject, predicate, object, importance, tags, theme]
const FACTS = [
  ["boit-lait", "utilisateur", "boit", "lait", 0.5, ["alimentation", "lait"], "alimentation/boissons"],
  ["intolerant-lactose", "utilisateur", "devient-intolerant-a", "lactose", 0.9, ["sante", "lactose"], "sante/allergies"],
  ["lactose-fromage", "lactose", "est-present-dans", "fromage, yaourt, creme", 0.6, ["lactose", "fromage", "yaourt"], "alimentation/boissons"],
  ["the-sucre", "utilisateur", "prefere", "the sucre", 0.6, ["the", "sucre"], "alimentation/boissons"],
  ["evite-gluten", "utilisateur", "evite", "gluten", 0.5, ["sante", "gluten"], "sante/allergies"],
  ["stockage-sqlite", "projet memsem", "stocke", "faits dans sqlite", 0.7, ["sqlite", "stockage"], "projet/memsem"],
  ["node-sqlite", "projet memsem", "utilise", "node:sqlite natif", 0.6, ["node", "sqlite"], "projet/memsem"],
  ["plugin-opencode", "projet memsem", "a-plugin-opencode-universel", "une ligne plugin memsem", 0.6, ["opencode", "plugin"], "projet/memsem"],
  ["setup-auto", "projet memsem", "a-auto-installateur", "memsem setup configure claude", 0.6, ["setup", "claude"], "projet/memsem"],
  ["typescript", "utilisateur", "developpe-avec", "typescript", 0.5, ["typescript", "dev"], "developpement/langages"],
  ["ts-node", "utilisateur", "code-avec", "typescript et node", 0.5, ["typescript", "node"], "developpement/langages"],
  ["ollama-local", "utilisateur", "utilise", "ollama en local", 0.6, ["ollama", "local", "embeddings"], "developpement/outils"],
  ["embedding-mxbai", "projet memsem", "embarque-avec", "mxbai-embed-large", 0.5, ["embeddings", "ollama"], "projet/memsem"],
  ["opencode-editeur", "utilisateur", "travaille-avec", "opencode", 0.6, ["opencode", "editeur"], "developpement/outils"],
  ["claude-editeur", "utilisateur", "utilise-aussi", "claude code", 0.5, ["claude", "editeur"], "developpement/outils"],
  ["supersession-douce", "projet memsem", "gere", "supersession douce", 0.7, ["supersession", "contradiction"], "projet/memsem"],
  ["priorite", "projet memsem", "priorise-avec", "importance confiance recence frequence", 0.6, ["priorite", "scoring"], "projet/memsem"],
  ["economie-tokens", "utilisateur", "veut-economiser", "les tokens", 0.7, ["tokens", "cout"], "developpement/pratiques"],
  ["stockage-local", "projet memsem", "sauvegarde-dans", "memory-mcp en local", 0.5, ["stockage", "local", "mcp"], "projet/memsem"],
  ["install-ollama", "utilisateur", "a-installe", "ollama", 0.6, ["ollama", "installation"], "developpement/outils"],
  ["extraction", "projet memsem", "extrait", "faits en fin de session", 0.6, ["extraction", "session"], "projet/memsem"],
  ["hippocampe", "projet memsem", "consolide-avec", "l hippocampe", 0.5, ["consolidation", "hippocampe"], "projet/memsem"],
  ["juge", "projet memsem", "recalibre-avec", "le juge", 0.5, ["scoring", "juge"], "projet/memsem"],
  ["cafe-matin", "utilisateur", "aime", "le cafe le matin", 0.4, ["cafe", "matin"], "alimentation/boissons"],
  ["vegetarien", "utilisateur", "mange", "vegetarien le soir", 0.4, ["vegetarien", "repas"], "alimentation/repas"],
  ["pates", "utilisateur", "adore", "les pates", 0.5, ["pates", "repas"], "alimentation/repas"],
  ["49-tests", "projet memsem", "teste-avec", "49 tests", 0.5, ["tests", "ci"], "projet/memsem"],
  ["ci-node", "projet memsem", "a-ci", "node 22 et 24", 0.5, ["ci", "node", "github-actions"], "projet/memsem"],
  ["github", "utilisateur", "pousse-sur", "github", 0.5, ["github", "git"], "developpement/outils"],
  ["npm", "projet memsem", "publie-sur", "npm", 0.6, ["npm", "publication"], "projet/memsem"],
  ["memoire-privee", "utilisateur", "veut", "la memoire jamais commitee", 0.8, ["prive", "git"], "projet/memsem"],
  ["api-mcp", "projet memsem", "fournit", "une api mcp", 0.6, ["mcp", "api"], "projet/memsem"],
  ["config-plugin", "utilisateur", "configure-avec", "le plugin memsem", 0.5, ["memsem", "config"], "projet/memsem"],
  ["themes", "projet memsem", "gere-les", "themes hierarchiques", 0.5, ["themes", "routage"], "projet/memsem"],
  ["index-injection", "projet memsem", "injecte", "l index dans les sessions", 0.6, ["index", "contexte"], "projet/memsem"],
  ["code-fr", "utilisateur", "ecrit-du", "code en francais", 0.4, ["francais", "code"], "developpement/pratiques"],
  ["memory-search", "projet memsem", "offre", "memory_search", 0.6, ["recherche", "outil"], "projet/memsem"],
  ["memory-list", "projet memsem", "offre-aussi", "memory_list", 0.5, ["liste", "outil"], "projet/memsem"],
  ["minimalisme", "utilisateur", "apprecie", "les outillages minimalistes", 0.5, ["minimalisme", "outils"], "developpement/pratiques"],
  ["zero-deps", "projet memsem", "depend-de", "zero binaire natif", 0.5, ["dependances", "zero"], "projet/memsem"],
  ["choix-local", "utilisateur", "choisit", "le stockage local", 0.6, ["local", "stockage", "vie-privee"], "developpement/pratiques"],
  ["historique", "projet memsem", "garde", "l historique des faits", 0.5, ["historique", "supersession"], "projet/memsem"],
  ["precision", "utilisateur", "demande", "des resultats de recherche precis", 0.6, ["recherche", "precision"], "developpement/pratiques"],
  ["recherche-theme", "projet memsem", "recherche-par", "theme", 0.5, ["theme", "recherche"], "projet/memsem"],
  ["anti-cloud", "utilisateur", "deteste", "les dependances cloud", 0.6, ["cloud", "dependances", "vie-privee"], "developpement/pratiques"],
  ["episodes", "projet memsem", "stocke-les", "episodes de session", 0.5, ["episodes", "session"], "projet/memsem"],
  ["linux", "utilisateur", "utilise-comme-os", "linux", 0.5, ["linux", "os"], "developpement/environnement"],
  ["node-22", "projet memsem", "tourne-sur", "node 22", 0.9, ["node", "runtime"], "projet/memsem"],
  ["simplicite", "utilisateur", "trouve", "les solutions simples belles", 0.5, ["simplicite"], "developpement/pratiques"],
  ["archive", "projet memsem", "archive-les", "faits contradits", 0.5, ["archive", "supersession"], "projet/memsem"],
  ["node-test", "utilisateur", "teste-les", "versions de node", 0.4, ["node", "test"], "developpement/environnement"],
];

// [requête, labels pertinents]
const QUERIES = [
  ["lait", ["boit-lait", "intolerant-lactose"]],
  ["lactose", ["intolerant-lactose", "lactose-fromage"]],
  ["fromage", ["lactose-fromage"]],
  ["the", ["the-sucre"]],
  ["intolerant", ["intolerant-lactose"]],
  ["sqlite", ["stockage-sqlite", "node-sqlite"]],
  ["node", ["node-sqlite", "node-22"]],
  ["ollama", ["ollama-local", "install-ollama", "embedding-mxbai"]],
  ["opencode", ["opencode-editeur", "plugin-opencode"]],
  ["claude", ["claude-editeur", "setup-auto"]],
  ["supersession", ["supersession-douce", "historique", "archive"]],
  ["priorite", ["priorite"]],
  ["tokens", ["economie-tokens"]],
  ["memoire", ["memoire-privee"]],
  ["extraction", ["extraction"]],
  ["episodes", ["episodes"]],
  ["mcp", ["api-mcp", "stockage-local"]],
  ["vegetarien", ["vegetarien"]],
  ["github", ["github", "ci-node"]],
  ["vie privee", ["memoire-privee", "choix-local", "anti-cloud"]],
];

const CONFIG_SETS = {
  "defaut": {},
  "egalitaire": { priority: { importance: 0.25, confidence: 0.25, recency: 0.25, frequency: 0.25 } },
  "recence-heavy": { priority: { importance: 0.3, confidence: 0.15, recency: 0.45, frequency: 0.1 } },
  "confiance-heavy": { priority: { importance: 0.2, confidence: 0.5, recency: 0.15, frequency: 0.15 } },
  "seuil-0.4": { minLexical: 0.4 },
};

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-bench-"));
const dbPath = path.join(tmpDir, "bench.db");
const configFile = path.join(tmpDir, "config.json");

async function metricsFor(config) {
  fs.writeFileSync(configFile, JSON.stringify(config));
  process.env.MEMSEM_CONFIG = configFile;
  resetConfig();
  const db = new MemoryDb(dbPath);
  const ids = new Map();
  for (const [label, subject, predicate, object, importance, tags, theme] of FACTS) {
    const result = db.add({ subject, predicate, object, importance, tags, theme, project: "bench" });
    ids.set(label, result.id);
  }
  // Vieillir certains faits pour que la récence discrimine (0j / 7j / 14j / 30j).
  const ageByLabel = [
    ["cafe-matin", 30], ["vegetarien", 30], ["pates", 21], ["the-sucre", 14], ["github", 14],
    ["intolerant-lactose", 7], ["supersession-douce", 7], ["priorite", 3], ["npm", 1], ["episodes", 1],
    ["node-22", 30], ["ci-node", 30],
  ];
  const raw = db["db"];
  const update = raw.prepare(`UPDATE memories SET updated_at = ? WHERE id = ?`);
  for (const [label, days] of ageByLabel) {
    const id = ids.get(label);
    if (id !== undefined) update.run(new Date(Date.now() - days * 24 * 3600 * 1000).toISOString(), id);
  }

  let p3 = 0, r3 = 0, p5 = 0, r5 = 0;
  for (const [query, expected] of QUERIES) {
    const expectedIds = expected.map((l) => ids.get(l)).filter((x) => x !== undefined);
    const hits = await db.search(query, null, null, 5);
    const found = new Set(hits.map((h) => h.id));
    const relevant = expectedIds.filter((e) => found.has(e)).length;
    const top3 = new Set(hits.slice(0, 3).map((h) => h.id));
    const rel3 = expectedIds.filter((e) => top3.has(e)).length;
    const k3 = Math.min(3, expectedIds.length);
    p3 += rel3 / k3;
    r3 += rel3 / expectedIds.length;
    p5 += relevant / 5;
    r5 += relevant / expectedIds.length;
  }
  db.close();
  return { p3: p3 / QUERIES.length, r3: r3 / QUERIES.length, p5: p5 / QUERIES.length, r5: r5 / QUERIES.length };
}

console.log(`Banc memsem — ${FACTS.length} faits, ${QUERIES.length} requêtes, recherche stricte`);
console.log("(certains faits sont vieillis : la récence est discriminante)\n");
console.log("jeu de constantes    | P@3    R@3    P@5    R@5");
console.log("---------------------+------------------------------");
const results = [];
for (const [name, config] of Object.entries(CONFIG_SETS)) {
  const m = await metricsFor(config);
  results.push([name, m]);
  console.log(
    `${name.padEnd(20)} | ${m.p3.toFixed(3)}  ${m.r3.toFixed(3)}  ${m.p5.toFixed(3)}  ${m.r5.toFixed(3)}`,
  );
}
fs.rmSync(tmpDir, { recursive: true, force: true });
process.env.MEMSEM_CONFIG = "";
resetConfig();
