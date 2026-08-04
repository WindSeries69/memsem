#!/usr/bin/env node
// Démo memsem — base TEMPORAIRE : la vraie mémoire (~/.memory-mcp) n'est jamais touchée.
// Usage : npm run build && node scripts/demo.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

  console.log("=== memsem — démo sur base temporaire ===");
  console.log("(ta vraie mémoire dans ~/.memory-mcp reste intacte)\n");

  console.log("1. L'IA écrit les faits durables (memory_add_many)");
  await call(client, "memory_add_many", {
    facts: [
      { subject: "utilisateur", predicate: "boit", object: "lait", importance: 0.5, tags: ["alimentation", "lait"], theme: "alimentation/boissons" },
      { subject: "utilisateur", predicate: "devient-intolerant-a", object: "lactose", importance: 0.9, tags: ["sante", "lactose"], theme: "sante/allergies" },
      { subject: "lactose", predicate: "est-present-dans", object: "fromage, yaourt, creme", importance: 0.6, tags: ["lactose", "fromage", "yaourt", "creme"], theme: "alimentation/boissons" },
      { subject: "utilisateur", predicate: "prefere", object: "the sucre", importance: 0.6, tags: ["the", "sucre"], theme: "alimentation/boissons" },
    ],
  });
  console.log("   → 4 faits écrits\n");

  console.log("2. Recherche stricte (lexicale) : memory_search { query: 'lait' }");
  const strict = await call(client, "memory_search", { query: "lait", limit: 3 });
  for (const h of strict) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);
  console.log("");

  console.log("3. Recherche sémantique (relax, embeddings locaux) : memory_search { query: 'fromage', relax: true }");
  console.log("   Aucun mot commun avec « lactose » — c'est l'index sémantique (Ollama, local) qui relie");
  const relax = await call(client, "memory_search", { query: "fromage", relax: true, limit: 3 });
  for (const h of relax) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);
  console.log("");

  console.log("4. Supersession douce : l'IA apprend que l'utilisateur ne boit plus de lait");
  const supersede = await call(client, "memory_add", {
    subject: "utilisateur", predicate: "boit", object: "plus de lait (intolerant au lactose)",
    importance: 0.9, theme: "sante/allergies", tags: ["lactose", "lait"],
  });
  console.log(`   → conflict: ${supersede.conflict}, ancien fait estompé (faded: ${JSON.stringify(supersede.faded)})\n`);

  console.log("5. La recherche retrouve le fait actuel");
  const after = await call(client, "memory_search", { query: "lait", limit: 3 });
  for (const h of after) console.log(`   → ${h.subject} → ${h.predicate} → ${h.object}`);

  const stats = await call(client, "memory_stats", {});
  console.log(`\nStats : ${stats.memoriesActive} mémoires actives, index sémantique ${stats.semantic?.available ? `OK (${stats.semantic.model})` : "indisponible"}`);
} finally {
  await client.close().catch(() => {});
  rmSync(tmpDir, { recursive: true, force: true });
}
