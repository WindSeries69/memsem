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

function runList(args: string[], dbPath: string): void {
  const theme = argValue(args, "theme");
  const project = argValue(args, "project");
  const limit = Number(argValue(args, "limit") ?? 50);
  const includeArchived = args.includes("--all");
  const db = new MemoryDb(dbPath);
  try {
    const rows = db.listAll(includeArchived, 500);
    const filtered = rows.filter((r) => {
      if (theme && !(r.theme === theme || r.theme?.startsWith(`${theme}/`))) return false;
      if (project && r.project !== project) return false;
      return true;
    });
    if (filtered.length === 0) {
      console.log("Aucune mémoire.");
      return;
    }
    for (const r of filtered.slice(0, limit)) {
      const flags = [
        r.pinned ? "P" : "",
        r.archived ? "A" : "",
        r.theme ? `[${r.theme}]` : "",
      ]
        .filter(Boolean)
        .join(" ");
      console.log(
        `#${String(r.id).padEnd(4)} imp ${r.importance.toFixed(2)} conf ${r.confidence.toFixed(2)} ${flags.padEnd(24)} ${r.subject} → ${r.predicate} → ${r.object}`,
      );
    }
    if (filtered.length > limit) console.log(`… et ${filtered.length - limit} autres (--limit pour tout voir)`);
  } finally {
    db.close();
  }
}

function runEdit(args: string[], dbPath: string): void {
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error("Usage: memsem edit <id> [--subject S] [--predicate P] [--object O] [--importance 0.6] [--theme T] [--untheme] [--tags a,b] [--pin] [--unpin]");
    process.exit(1);
  }
  const fields: Record<string, string | number | boolean | string[] | null> = {};
  const flags: Array<[string, string]> = [
    ["subject", "--subject"],
    ["predicate", "--predicate"],
    ["object", "--object"],
    ["importance", "--importance"],
    ["theme", "--theme"],
    ["tags", "--tags"],
  ];
  for (const [key, flag] of flags) {
    const value = argValue(args, flag.slice(2));
    if (value !== undefined) fields[key] = key === "importance" ? Number(value) : key === "tags" ? value.split(",") : value;
  }
  if (args.includes("--untheme")) fields.theme = null;
  if (args.includes("--pin")) fields.pin = true;
  if (args.includes("--unpin")) fields.pin = false;
  if (Object.keys(fields).length === 0) {
    console.error("Rien à modifier — passe au moins un --champ.");
    process.exit(1);
  }
  const db = new MemoryDb(dbPath);
  try {
    const result = db.edit(id, fields);
    if (!result) {
      console.error(`Fait #${id} introuvable ou archivé (immuable).`);
      process.exit(1);
    }
    const b = result.before;
    const a = result.after;
    console.log(`#${id} ${b.subject} → ${b.predicate} → ${b.object}`);
    if (b.subject !== a.subject) console.log(`  subject : ${b.subject} → ${a.subject}`);
    if (b.predicate !== a.predicate) console.log(`  predicate : ${b.predicate} → ${a.predicate}`);
    if (b.object !== a.object) console.log(`  object : ${b.object} → ${a.object}`);
    if (b.importance !== a.importance) console.log(`  importance : ${b.importance.toFixed(2)} → ${a.importance.toFixed(2)}`);
    if (b.theme !== a.theme) console.log(`  theme : ${b.theme ?? "—"} → ${a.theme ?? "—"}`);
    if (JSON.stringify(b.tags) !== JSON.stringify(a.tags)) console.log(`  tags : ${b.tags.join(",") || "—"} → ${a.tags.join(",") || "—"}`);
    if (b.pinned !== a.pinned) console.log(`  pinned : ${b.pinned} → ${a.pinned}`);
    console.log("  (audité)");
  } finally {
    db.close();
  }
}

function confirm(message: string): boolean {
  if (process.env.MEMSEM_YES === "1" || process.argv.includes("--yes")) return true;
  process.stdout.write(`${message} [y/N] `);
  const buf = Buffer.alloc(64);
  let bytes = 0;
  try {
    bytes = fs.readSync(0, buf, 0, 64, null);
  } catch {
    return false;
  }
  const answer = buf.toString("utf8", 0, bytes).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

function runForget(args: string[], dbPath: string): void {
  const id = Number(args[0]);
  if (!Number.isInteger(id) || id <= 0) {
    console.error("Usage: memsem forget <id> [--yes]");
    process.exit(1);
  }
  const db = new MemoryDb(dbPath);
  try {
    const row = db.get(id);
    if (!row || row.archived) {
      console.error(`Fait #${id} introuvable ou déjà archivé.`);
      process.exit(1);
    }
    console.log(`Fait #${id} : ${row.subject} → ${row.predicate} → ${row.object}`);
    if (!confirm("Archiver ce fait (il ne remontera plus, l'historique reste) ?")) {
      console.log("Annulé.");
      return;
    }
    if (db.forget(id, "cli-forget")) console.log(`Fait #${id} archivé.`);
    else console.error(`Fait #${id} introuvable.`);
  } finally {
    db.close();
  }
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
    case "list":
      return runList(args.slice(1), dbPath);
    case "edit":
      return runEdit(args.slice(1), dbPath);
    case "forget":
      return runForget(args.slice(1), dbPath);
    default:
      console.error(`Commande inconnue: ${cmd}`);
      console.error("Commandes: setup, export, import, doctor, list, edit, forget");
      process.exit(1);
  }
}
