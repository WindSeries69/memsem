// Commandes CLI de memsem : export / import / doctor / list / edit / forget.
// Dispatch depuis src/index.ts (process.argv[2]).
import fs from "node:fs";
import path from "node:path";
import { MemoryDb } from "./db.js";

function argValue(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  if (at === -1 || at + 1 >= args.length) return undefined;
  return args[at + 1];
}

function runExport(args: string[], dbPath: string): void {
  const project = argValue(args, "project") ?? null;
  const output = argValue(args, "output");
  const db = new MemoryDb(dbPath);
  try {
    const payload = db.exportJSON(project);
    const target = output ?? `memsem-export-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
    fs.writeFileSync(target, JSON.stringify(payload, null, 2));
    const active = payload.memories.filter((m) => Number(m.archived) === 0).length;
    console.log(
      `Export: ${payload.memories.length} faits (${active} actifs, ${payload.memories.length - active} archives), ` +
        `${payload.history.length} historiques, ${payload.edges.length} aretes, ${payload.episodes.length} episodes`,
    );
    console.log(`Fichier: ${path.resolve(target)}`);
  } finally {
    db.close();
  }
}

function runDoctor(args: string[], dbPath: string): void {
  const limit = Number(argValue(args, "limit") ?? 10);
  const hours = Number(argValue(args, "hours") ?? 24);
  const db = new MemoryDb(dbPath);
  try {
    const rows = db.mostModified(limit, hours);
    const stats = db.stats();
    console.log(`memsem doctor — faits les plus modifiés (${hours}h, max ${limit})`);
    console.log(`base: ${stats.memoriesActive} actives, ${stats.memoriesArchived} archivées, schéma v${db.version()}`);
    if (rows.length === 0) {
      console.log("Aucune modification d'importance récente. Pas de signe de dérive.");
      return;
    }
    console.log("");
    for (const r of rows) {
      console.log(`#${r.entityId} ${r.subject} → ${r.predicate} → ${r.object}`);
      console.log(`   ${r.changes} changements, Δ total ${r.totalDelta.toFixed(3)}, ${r.dryRuns} dry-run, dernier: ${r.lastChange}`);
      console.log(`   raison: ${r.lastReason ?? "—"}`);
    }
  } finally {
    db.close();
  }
}

function runImport(args: string[], dbPath: string): void {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: memsem import <fichier.json>");
    process.exit(1);
  }
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const db = new MemoryDb(dbPath);
  try {
    const result = db.importJSON(payload);
    console.log(
      `Import: ${result.memories} faits, ${result.history} historiques, ${result.edges} aretes, ${result.episodes} episodes`,
    );
  } finally {
    db.close();
  }
}

export function runCli(args: string[], dbPath: string): void {
  const cmd = args[0];
  switch (cmd) {
    case "export":
      return runExport(args.slice(1), dbPath);
    case "import":
      return runImport(args.slice(1), dbPath);
    case "doctor":
      return runDoctor(args.slice(1), dbPath);
    default:
      console.error(`Commande inconnue: ${cmd}`);
      console.error("Commandes: setup, export, import, doctor");
      process.exit(1);
  }
}
