// Tests de durabilité : migrations versionnées, backup automatique, WAL,
// crash simulé, export/import JSON round-trip.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryDb, HEAD_VERSION } from "../db.js";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memsem-durability-"));
let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("ECHEC:", message);
    failures++;
  } else {
    console.log("OK:", message);
  }
}

// Simule une base v1 (schéma historique 0.x, sans schema_migrations,
// sans pinned/theme/embedding).
function createV1Db(filePath: string): void {
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(`
    CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      importance REAL NOT NULL DEFAULT 0.5,
      confidence REAL NOT NULL DEFAULT 0.5,
      frequency INTEGER NOT NULL DEFAULT 1,
      project TEXT NOT NULL DEFAULT '',
      provenance TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_memories_project ON memories(project);
    CREATE INDEX idx_memories_archived ON memories(archived);
    CREATE TABLE memory_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      previous TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
    CREATE TABLE edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
      relation TEXT NOT NULL DEFAULT 'related',
      UNIQUE(source_id, target_id)
    );
    CREATE TABLE episodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL DEFAULT '',
      summary TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, created_at, updated_at)
     VALUES ('utilisateur', 'boit', 'lait', '[]', 0.5, 0.5, 1, 'global', ?, ?)`,
  ).run(new Date().toISOString(), new Date().toISOString());
  db.prepare(`INSERT INTO episodes (project, summary, created_at) VALUES ('global', 'ancien episode v1', ?)`).run(
    new Date().toISOString(),
  );
  db.close();
}

// 1. Le mode WAL est actif sur une base ouverte par MemoryDb.
{
  const dbPath = path.join(tmpDir, "wal.db");
  const db = new MemoryDb(dbPath);
  db.close();
  const raw = new DatabaseSync(dbPath, { readOnly: true });
  const mode = (raw.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode;
  raw.close();
  assert(mode === "wal", "mode WAL actif sur la base");
}

// 2. Migration d'une base v1 vers HEAD : données intactes, colonnes ajoutées, registre complet.
{
  const dbPath = path.join(tmpDir, "v1.db");
  createV1Db(dbPath);
  const db = new MemoryDb(dbPath);
  assert(db.version() === HEAD_VERSION, `base v1 migree jusqu'a HEAD (${HEAD_VERSION})`);
  const migrations = db.appliedMigrations();
  assert(
    migrations.length === HEAD_VERSION && migrations.every((m, i) => m.version === i + 1),
    "registre schema_migrations complet et ordonne",
  );
  const list = db.list(null, null, 10);
  assert(list.length === 1 && list[0].object === "lait", "donnees v1 intactes apres migration");
  const episodes = db.episodeSearch(null, null, 10);
  assert(episodes.length === 1 && episodes[0].summary === "ancien episode v1", "episodes v1 conserves");
  const added = db.add({ subject: "utilisateur", predicate: "adore", object: "the sucre", theme: "alimentation", project: "global" });
  assert(added.created === true && added.id > 0, "ecriture possible sur base migree");
  db.close();
}

// 3. Idempotence : rouvrir la base ne rejoue aucune migration, ne refait aucun backup.
{
  const dbPath = path.join(tmpDir, "v1.db");
  const backupsBefore = fs.existsSync(path.join(tmpDir, "backups"))
    ? fs.readdirSync(path.join(tmpDir, "backups")).filter((f) => f.endsWith(".db.bak")).length
    : 0;
  assert(backupsBefore > 0, "backup automatique cree avant migration");
  const db = new MemoryDb(dbPath);
  assert(db.version() === HEAD_VERSION, "rouverture: version stable (HEAD)");
  db.close();
  const backupsAfter = fs.readdirSync(path.join(tmpDir, "backups")).filter((f) => f.endsWith(".db.bak")).length;
  assert(backupsAfter === backupsBefore, "rouverture sans migration: aucun nouveau backup");
}

// 4. Crash simule : une ecriture abandonnee (transaction ouverte puis process "mort")
//    ne corrompt pas la base et est bien annulee.
{
  const dbPath = path.join(tmpDir, "crash.db");
  const db = new MemoryDb(dbPath);
  db.add({ subject: "utilisateur", predicate: "a", object: "fait stable", project: "global" });
  db.close();

  // Simule la mort en pleine ecriture : BEGIN + INSERT puis fermeture sans COMMIT.
  const raw = new DatabaseSync(dbPath);
  raw.exec("BEGIN");
  raw
    .prepare(
      `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, created_at, updated_at)
       VALUES ('fantome', 'ecrit', 'en cours', '[]', 0.5, 0.5, 1, 'global', ?, ?)`,
    )
    .run(new Date().toISOString(), new Date().toISOString());
  raw.close(); // mort du process : rollback implicite

  const reopened = new MemoryDb(dbPath);
  const hits = reopened.episodeSearch(null, null, 5);
  const list = reopened.list(null, null, 20);
  assert(list.every((m) => m.subject !== "fantome"), "ecriture non commitee annulee (pas de corruption)");
  assert(list.some((m) => m.object === "fait stable"), "donnees precedentes intactes apres crash");
  assert(hits !== null, "base lisible apres crash");
  reopened.close();
}

// 5. Export/import round-trip : faits actifs + archives + pin + episodes + historique.
{
  const srcPath = path.join(tmpDir, "src.db");
  const dstPath = path.join(tmpDir, "dst.db");
  const src = new MemoryDb(srcPath);
  src.add({ subject: "utilisateur", predicate: "adore", object: "the sucre", theme: "alimentation/boissons", project: "global", importance: 0.7, pin: true });
  const second = src.add({ subject: "utilisateur", predicate: "boit", object: "lait", project: "global" });
  src.add({ subject: "utilisateur", predicate: "boit", object: "plus de lait", importance: 0.9, theme: "sante", project: "global" });
  src.addEpisode({ project: "global", summary: "episode de test export", provenance: "sess-export" });
  src.forget(second.id);
  const payload = src.exportJSON();
  src.close();

  const dst = new MemoryDb(dstPath);
  const result = dst.importJSON(payload);
  assert(result.memories === 3, "3 faits importes");
  const all = dst.list(null, null, 20);
  assert(all.some((m) => m.object === "the sucre" && m.pinned === true), "fait epingle conserve");
  assert(all.some((m) => m.object === "plus de lait"), "fait supersede importe");
  assert(!all.some((m) => m.object === "lait"), "fait archive reste archive (absent des actives)");
  const episodes = dst.episodeSearch(null, null, 10);
  assert(episodes.some((e) => e.summary === "episode de test export"), "episode importe");
  const stats = dst.stats();
  assert(stats.memoriesArchived === 1, "archive compte dans les stats apres import");

  // Re-import : idempotent (aucun doublon).
  const again = dst.importJSON(payload);
  assert(again.memories === 0 && again.episodes === 0, "re-import sans doublon");
  dst.close();
}

// 6. Déduplication sur valeurs héritées « sales » (espaces/casse) : un fait stocké
//    avec des espaces ne doit pas être ré-importé en doublon.
{
  const srcPath = path.join(tmpDir, "dirty-src.db");
  const dstPath = path.join(tmpDir, "dirty-dst.db");
  const src = new MemoryDb(srcPath);
  // Insertion brute avec espaces et casse (simule une base 0.x).
  src.close();
  const raw = new DatabaseSync(srcPath);
  raw
    .prepare(
      `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, created_at, updated_at)
       VALUES ('  Utilisateur  ', '  PREFERE ', '  le The ', '[]', 0.5, 0.5, 1, 'global', ?, ?)`,
    )
    .run(new Date().toISOString(), new Date().toISOString());
  raw.close();
  const dirtyPayload = new MemoryDb(srcPath).exportJSON();

  const dst = new MemoryDb(dstPath);
  const first = dst.importJSON(dirtyPayload);
  assert(first.memories === 1, "import initial: 1 fait");
  const second = dst.importJSON(dirtyPayload);
  assert(second.memories === 0, "re-import de valeurs sales: aucun doublon");
  assert(dst.list(null, null, 10).length === 1, "une seule occurrence en base");
  dst.close();
}

console.log(failures === 0 ? "\nDurabilite : tous les tests passent." : `\nDurabilite : ${failures} ECHECS.`);
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exitCode = failures === 0 ? 0 : 1;
