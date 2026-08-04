#!/usr/bin/env node
// memsem demo — TEMPORARY database: your real memory (~/.memory-mcp) is never touched.
// Usage : npm run build && node scripts/demo.mjs [--fr]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FR = process.argv.includes("--fr");
const T =   FR
  ? {
      title: "=== memsem — démo sur base temporaire ===",
      note: "(ta vraie mémoire dans ~/.memory-mcp reste intacte)",
      s1: "1. L'IA écrit les faits durables (memory_add_many)",
      s1ok: "   → 4 faits écrits",
      s2: "2. Recherche stricte (lexicale) : memory_search { query: 'lait' }",
      s3: "3. Recherche sémantique (relax, embeddings locaux) : memory_search { query: 'fromage', relax: true }",
      s3note: "Aucun mot commun avec « lactose » — c'est l'index sémantique (Ollama, local) qui relie",
      s4: "4. Supersession douce : l'IA apprend que l'utilisateur ne boit plus de lait",
      s5: "5. La recherche retrouve le fait actuel",
      stats: "Stats",
      facts: [
        { subject: "utilisateur", predicate: "boit", object: "lait", importance: 0.5, tags: ["alimentation", "lait"], theme: "alimentation/boissons" },
        { subject: "utilisateur", predicate: "devient-intolerant-a", object: "lactose", importance: 0.9, tags: ["sante", "lactose"], theme: "sante/allergies" },
        { subject: "lactose", predicate: "est-present-dans", object: "fromage, yaourt, creme", importance: 0.6, tags: ["lactose", "fromage", "yaourt", "creme"], theme: "alimentation/boissons" },
        { subject: "utilisateur", predicate: "prefere", object: "the sucre", importance: 0.6, tags: ["the", "sucre"], theme: "alimentation/boissons" },
      ],
      conflict: "→ conflict: true, ancien fait estompé",
      supersede: { subject: "utilisateur", predicate: "boit", object: "plus de lait (intolerant au lactose)", importance: 0.9, theme: "sante/allergies", tags: ["lactose", "lait"] },
      milkQuery: "lait",
      cheeseQuery: "fromage",
    }
  : {
      title: "=== memsem — demo on a temporary database ===",
      note: "(your real memory in ~/.memory-mcp stays untouched)",
      s1: "1. The AI writes durable facts (memory_add_many)",
      s1ok: "   → 4 facts written",
      s2: "2. Strict search (lexical): memory_search { query: 'milk' }",
      s3: "3. Semantic search (relax, local embeddings): memory_search { query: 'cheese', relax: true }",
      s3note: "No shared word with « lactose » — the local semantic index (Ollama) bridges it",
      s4: "4. Soft supersession: the AI learns you no longer drink milk",
      s5: "5. Search now returns the current fact",
      stats: "Stats",
      facts: [
        { subject: "user", predicate: "drinks", object: "milk", importance: 0.5, tags: ["food", "milk"], theme: "food/drinks" },
        { subject: "user", predicate: "is-intolerant-to", object: "lactose", importance: 0.9, tags: ["health", "lactose"], theme: "health/allergies" },
        { subject: "lactose", predicate: "is-present-in", object: "cheese, yogurt, cream", importance: 0.6, tags: ["lactose", "cheese", "yogurt", "cream"], theme: "food/drinks" },
        { subject: "user", predicate: "prefers", object: "sweet tea", importance: 0.6, tags: ["tea", "sugar"], theme: "food/drinks" },
      ],
      conflict: "   → conflict: true, old fact faded",
      supersede: { subject: "user", predicate: "drinks", object: "no more milk (lactose intolerant)", importance: 0.9, theme: "health/allergies", tags: ["lactose", "milk"] },
      milkQuery: "milk",
      cheeseQuery: "cheese",
    };

const here = dirname(fileURLToPath(import.meta.url));
const serverEntry = resolve(here, "../dist/index.js");
const tmpDir = mkdtempSync(join(tmpdir(), "memsem-demo-"));
const env = {
  ...process.env,
  MEMORY_DB_PATH: join(tmpDir, "demo.db"),
  MEMSEMS_INDEX_PATH: join(tmpDir, "index.md"),
};

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  return JSON.parse(text);
}

const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry], env });
const client = new Client({ name: "memsem-demo", version: "1.0.0" });
try {
  await client.connect(transport);

  console.log(T.title);
  console.log(T.note + "\n");

  console.log(T.s1);
  await call(client, "memory_add_many", { facts: T.facts });
  console.log(T.s1ok + "\n");

  console.log(T.s2);
  const strict = await call(client, "memory_search", { query: T.milkQuery, limit: 3 });
  for (const h of strict) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);
  console.log("");

  console.log(T.s3);
  console.log(`   ${T.s3note}`);
  const relax = await call(client, "memory_search", { query: T.cheeseQuery, relax: true, limit: 3 });
  for (const h of relax) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);
  console.log("");

  console.log(T.s4);
  const supersede = await call(client, "memory_add", T.supersede);
  console.log(`${T.conflict} (faded: ${JSON.stringify(supersede.faded)})\n`);

  console.log(T.s5);
  const after = await call(client, "memory_search", { query: T.milkQuery, limit: 3 });
  for (const h of after) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);

  const stats = await call(client, "memory_stats", {});
  console.log(
    `\n${T.stats}: ${stats.memoriesActive} active memories, semantic index ${stats.semantic?.available ? `OK (${stats.semantic.model})` : "unavailable"}`,
  );
} finally {
  await client.close().catch(() => {});
  rmSync(tmpDir, { recursive: true, force: true });
}
