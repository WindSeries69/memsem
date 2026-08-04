import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb } from "../db.js";
import { embed } from "../embed.js";
import { getConfig, resetConfig } from "../config.js";
import { tokenize } from "../scoring.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-regression-"));
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

// 1. Subject/predicate lookup is case-insensitive for supersession.
{
  const db = new MemoryDb(path.join(tmpDir, "case.db"));
  const first = db.add({ subject: "Bob", predicate: "likes", object: "tea", project: "g" });
  const replacement = db.add({ subject: "bob", predicate: "likes", object: "coffee", project: "g" });
  assert(replacement.conflict && replacement.faded.includes(first.id), "supersession: la casse du sujet ne crée pas un doublon");
  const cyrillicFirst = db.add({ subject: "Боб", predicate: "любит", object: "чай", project: "g" });
  const cyrillicReplacement = db.add({ subject: "боб", predicate: "любит", object: "кофе", project: "g" });
  assert(cyrillicReplacement.conflict && cyrillicReplacement.faded.includes(cyrillicFirst.id), "supersession: la casse Unicode est normalisée");
  db.close();
}

// 2. Re-asserting a rejected value also supersedes its current contradiction.
{
  const db = new MemoryDb(path.join(tmpDir, "resurrection.db"));
  const original = db.add({ subject: "user", predicate: "drinks", object: "milk", project: "g" });
  const correction = db.add({ subject: "user", predicate: "drinks", object: "water", project: "g" });
  db.add({ subject: "user", predicate: "drinks", object: "water", project: "g" });
  const before = db.get(correction.id)?.confidence ?? 0;
  const resurrected = db.add({ subject: "user", predicate: "drinks", object: "milk", project: "g" });
  const after = db.get(correction.id)?.confidence ?? before;
  assert(resurrected.resurrected && resurrected.faded.includes(correction.id), "résurrection: la correction vivante est à nouveau estompée");
  assert(after < before, "résurrection: la confiance de la contradiction diminue");
  assert((db.get(original.id)?.archived ?? false) === false, "résurrection: la valeur rejetée redevient active");
  db.close();
}

// 3. Configured confidence values are returned, not hardcoded values.
{
  const configPath = path.join(tmpDir, "config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify({ initialConfidence: 0.21, supersedeConfidence: 0.73, resurrectConfidence: 0.17 }),
  );
  const previousConfig = process.env.MEMSEM_CONFIG;
  process.env.MEMSEM_CONFIG = configPath;
  resetConfig();
  const db = new MemoryDb(path.join(tmpDir, "confidence.db"));
  const initial = db.add({ subject: "user", predicate: "status", object: "one", project: "g" });
  const replacement = db.add({ subject: "user", predicate: "status", object: "two", project: "g" });
  assert(initial.confidence === 0.21, "confiance: la valeur initiale configurée est renvoyée");
  assert(replacement.confidence === 0.73, "confiance: la valeur de supersession configurée est renvoyée");
  db.close();
  if (previousConfig === undefined) delete process.env.MEMSEM_CONFIG;
  else process.env.MEMSEM_CONFIG = previousConfig;
  resetConfig();
}

// 4. Unicode words, including one-character CJK terms, remain searchable.
{
  const dbPath = path.join(tmpDir, "unicode.db");
  const db = new MemoryDb(dbPath);
  const cases = [
    ["Русский текст", "Русский текст"],
    ["中文测试", "中文测试"],
    ["日本語テキスト", "日本語テキスト"],
    ["한국어 테스트", "한국어 테스트"],
    ["हिंदी पाठ", "हिंदी पाठ"],
    ["łódź", "łódź"],
    ["茶", "茶"],
  ] as const;
  for (const [object, query] of cases) {
    db.add({ subject: "user", predicate: "knows", object, project: "g" });
    const hits = await db.search(query, "g", null, 10);
    assert(hits.some((hit) => hit.object === object), `unicode: recherche de « ${query} »`);
  }
  const tokens = tokenize("Русский 中文 日本語 한국어 हिंदी łódź 茶");
  assert(tokens.length >= 7 && tokens.includes("हिंदी") && tokens.includes("茶"), "unicode: tokenizer conserve les scripts non latins");
  const raw = new DatabaseSync(dbPath, { readOnly: true });
  const fts = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'")
    .get() as { name?: string } | undefined;
  assert(fts?.name === "memory_fts", "index: FTS5 est présent dans la base");
  raw.close();
  db.close();
}

// 5. Ollama receives the configured model string in the request body.
{
  const previousModel = process.env.MEMSEM_EMBED_MODEL;
  process.env.MEMSEM_EMBED_MODEL = "regression-model";
  resetConfig();
  const previousFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ embeddings: [[1, 0]] }), { status: 200 });
  }) as typeof fetch;
  try {
    const vector = await embed("hello");
    assert(vector?.[0] === 1, "embedding: réponse Ollama décodée");
    assert(body?.model === "regression-model", "embedding: le modèle est transmis comme chaîne");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousModel === undefined) delete process.env.MEMSEM_EMBED_MODEL;
    else process.env.MEMSEM_EMBED_MODEL = previousModel;
    resetConfig();
  }
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nRégressions : tous les tests passent." : `\nRégressions : ${failures} ECHECS.`);
process.exitCode = failures === 0 ? 0 : 1;
