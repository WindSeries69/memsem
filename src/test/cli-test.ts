// Tests CLI : list / edit / forget (avec confirmation) — niveau base et processus.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryDb } from "../db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliEntry = path.resolve(here, "../index.js");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-cli-"));
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

function runCli(args: string[], input?: string): { status: number; stdout: string } {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    env: { ...process.env, MEMORY_DB_PATH: dbPath },
    input,
    encoding: "utf8",
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? "" };
}

const dbPath = path.join(tmpDir, "cli.db");

// 1. Niveau base : edit modifie les champs fournis seulement et audite.
{
  const db = new MemoryDb(dbPath);
  const id = db.add({ subject: "utilisateur", predicate: "boit", object: "lait", importance: 0.5, theme: "alimentation", project: "g" }).id;
  const result = db.edit(id, { object: "the", importance: 0.7 });
  assert(result?.after.object === "the" && result.after.importance === 0.7, "edit: object et importance modifiés");
  assert(result?.before.object === "lait" && result.before.importance === 0.5, "edit: before = état initial");
  const row = db.get(id);
  assert(row?.theme === "alimentation" && row.subject === "utilisateur", "edit: champs non fournis inchangés");
  const doctor = db.mostModified(10);
  assert(doctor.length === 1 && doctor[0].changes === 1, "edit audité (journal)");
  db.close();
}

// 2. Niveau base : un fait archivé est immuable ; forget audite.
{
  const db = new MemoryDb(dbPath);
  const id = db.add({ subject: "utilisateur", predicate: "evite", object: "gluten", project: "g" }).id;
  assert(db.forget(id, "test") === true, "forget: archivé");
  assert(db.forget(id, "test") === false, "forget: déjà archivé → false");
  assert(db.edit(id, { object: "autre" }) === null, "edit: fait archivé refusé");
  db.close();
}

// 3. CLI list : affiche les faits.
{
  const out = runCli(["list"]);
  assert(out.status === 0 && out.stdout.includes("boit") && out.stdout.includes("the"), "cli list: affiche les faits");
  const themed = runCli(["list", "--theme", "alimentation"]);
  assert(themed.stdout.includes("the") && !themed.stdout.includes("gluten"), "cli list --theme: filtre");
}

// 4. CLI forget : confirmation refusée → rien ; acceptée → archivé.
{
  const outNo = runCli(["forget", "1"], "n\n");
  assert(outNo.stdout.includes("Annulé"), "cli forget: réponse 'n' annule");
  const outYes = runCli(["forget", "1", "--yes"]);
  assert(outYes.stdout.includes("archivé"), "cli forget --yes: archive");
  const after = runCli(["list"]);
  assert(!after.stdout.includes("boit"), "cli forget: le fait ne remonte plus");
}

// 5. CLI edit : corrige et affiche avant/après.
{
  const db = new MemoryDb(dbPath);
  const id = db.add({ subject: "utilisateur", predicate: "mange", object: "pates", project: "g" }).id;
  db.close();
  const out = runCli(["edit", String(id), "--object", "pates fraiches", "--importance", "0.8"]);
  assert(out.status === 0 && out.stdout.includes("pates → pates fraiches"), "cli edit: avant/après affichés");
  const list = runCli(["list"]);
  assert(list.stdout.includes("pates fraiches"), "cli edit: correction visible au list");
  const bad = runCli(["edit", "9999", "--object", "x"]);
  assert(bad.status === 1, "cli edit: id inconnu → erreur");
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(failures === 0 ? "\nCLI : tous les tests passent." : `\nCLI : ${failures} ECHECS.`);
process.exitCode = failures === 0 ? 0 : 1;
