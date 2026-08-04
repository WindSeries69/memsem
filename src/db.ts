import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { computePriority, clamp01, searchScore, lexicalScore, minLexical, tokenize } from "./scoring.js";
import { getConfig } from "./config.js";
import { ollamaAvailable, embed, cosine } from "./embed.js";

export interface MemoryRecord {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  tags: string[];
  importance: number;
  confidence: number;
  frequency: number;
  project: string;
  provenance: string | null;
  trust: MemoryTrust;
  evidence: string | null;
  recordedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  pinned: boolean;
  theme: string | null;
}

export type MemoryTrust = "inferred" | "verbatim" | "verified";

const TRUST_RANK: Record<MemoryTrust, number> = { inferred: 0, verbatim: 1, verified: 2 };

function normalizeTrust(value: string | undefined): MemoryTrust {
  if (value === undefined) return "inferred";
  if (value === "inferred" || value === "verbatim" || value === "verified") return value;
  throw new Error(`trust invalide: ${value}`);
}

function normalizeDate(value: string | undefined, field: string): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(`${field} invalide: ${value}`);
  return new Date(time).toISOString();
}

export interface AddInput {
  subject: string;
  predicate: string;
  object: string;
  importance?: number;
  tags?: string[];
  theme?: string;
  project: string;
  provenance?: string;
  trust?: MemoryTrust;
  evidence?: string;
  validFrom?: string;
  validUntil?: string;
  pin?: boolean;
}

export interface AddResult {
  id: number;
  created: boolean;
  changed: boolean;
  conflict: boolean;
  resurrected: boolean;
  confidence: number;
  frequency: number;
  faded: number[];
  archived: number[];
  history: Array<{ previous: string; changedAt: string }>;
  rejected?: boolean;
  rejectionReason?: string;
}

export interface SearchHit {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  tags: string[];
  importance: number;
  confidence: number;
  frequency: number;
  pinned: boolean;
  theme: string | null;
  project: string;
  provenance: string | null;
  trust: MemoryTrust;
  evidence: string | null;
  recordedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  priority: number;
  score: number;
}

interface MemoryKeyRow {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  tags: string;
  importance: number;
  confidence: number;
  frequency: number;
  pinned: number;
  archived: number;
  provenance: string | null;
  trust: MemoryTrust;
  evidence: string | null;
  recorded_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export interface CandidateInput extends Omit<AddInput, "pin"> {}

export interface MemoryCandidate {
  id: number;
  subject: string;
  predicate: string;
  object: string;
  tags: string[];
  importance: number;
  theme: string | null;
  project: string;
  provenance: string | null;
  trust: MemoryTrust;
  evidence: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

function normalizeKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

function ftsQuery(text: string): string {
  return [...new Set(tokenize(text))]
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(" OR ");
}

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseSync) => void;
}

// Migrations ordonnées. NE JAMAIS modifier une migration publiée : ajouter la suivante.
// v1 = schéma historique (création idempotente + colonnes ajoutées par ALTER).
// Toute base existante (0.x) est migrée automatiquement, avec backup avant migration.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "baseline-2026-08",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
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
        CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
        CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived);

        CREATE TABLE IF NOT EXISTS memory_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memory_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          previous TEXT NOT NULL,
          changed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS edges (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          target_id INTEGER NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
          relation TEXT NOT NULL DEFAULT 'related',
          UNIQUE(source_id, target_id)
        );

        CREATE TABLE IF NOT EXISTS episodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project TEXT NOT NULL DEFAULT '',
          summary TEXT,
          provenance TEXT,
          created_at TEXT NOT NULL
        );
      `);
      for (const alter of [
        `ALTER TABLE episodes ADD COLUMN provenance TEXT`,
        `DROP INDEX IF EXISTS idx_memories_live`,
        `ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE memories ADD COLUMN theme TEXT`,
        `ALTER TABLE memories ADD COLUMN embedding TEXT`,
      ]) {
        try {
          db.exec(alter);
        } catch {
          // colonne déjà présente (base existante) — idempotent
        }
      }
    },
  },
  {
    version: 2,
    name: "history-index",
    up: (db) => {
      db.exec(`CREATE INDEX IF NOT EXISTS idx_history_memory ON memory_history(memory_id);`);
    },
  },
  {
    version: 3,
    name: "audit-log",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity TEXT NOT NULL,
          entity_id INTEGER NOT NULL,
          field TEXT NOT NULL,
          old_value TEXT,
          new_value TEXT,
          reason TEXT,
          pass_id TEXT,
          dry_run INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_pass ON audit_log(pass_id, entity_id);
      `);
    },
  },
  {
    version: 4,
    name: "memory-fts",
    up: (db) => {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          subject,
          predicate,
          object,
          tags,
          content = 'memories',
          content_rowid = 'id',
          tokenize = 'unicode61'
        );
        INSERT INTO memory_fts(memory_fts) VALUES ('rebuild');
        CREATE TRIGGER IF NOT EXISTS memory_fts_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memory_fts(rowid, subject, predicate, object, tags)
          VALUES (new.id, new.subject, new.predicate, new.object, new.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS memory_fts_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, subject, predicate, object, tags)
          VALUES ('delete', old.id, old.subject, old.predicate, old.object, old.tags);
        END;
        CREATE TRIGGER IF NOT EXISTS memory_fts_au AFTER UPDATE ON memories BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, subject, predicate, object, tags)
          VALUES ('delete', old.id, old.subject, old.predicate, old.object, old.tags);
          INSERT INTO memory_fts(rowid, subject, predicate, object, tags)
          VALUES (new.id, new.subject, new.predicate, new.object, new.tags);
        END;
        CREATE INDEX IF NOT EXISTS idx_memories_link_subject
          ON memories(project, archived, lower(trim(subject)));
        CREATE INDEX IF NOT EXISTS idx_memories_link_object
          ON memories(project, archived, lower(trim(object)));
      `);
    },
  },
  {
    version: 5,
    name: "evidence-temporal",
    up: (db) => {
      for (const alter of [
        `ALTER TABLE memories ADD COLUMN trust TEXT NOT NULL DEFAULT 'inferred'`,
        `ALTER TABLE memories ADD COLUMN evidence TEXT`,
        `ALTER TABLE memories ADD COLUMN recorded_at TEXT`,
        `ALTER TABLE memories ADD COLUMN valid_from TEXT`,
        `ALTER TABLE memories ADD COLUMN valid_until TEXT`,
        `ALTER TABLE memory_history ADD COLUMN previous_trust TEXT`,
        `ALTER TABLE memory_history ADD COLUMN previous_evidence TEXT`,
        `ALTER TABLE memory_history ADD COLUMN previous_valid_from TEXT`,
        `ALTER TABLE memory_history ADD COLUMN previous_valid_until TEXT`,
        `ALTER TABLE memory_history ADD COLUMN recorded_at TEXT`,
      ]) {
        try {
          db.exec(alter);
        } catch {
          // colonne déjà présente (base existante) — idempotent
        }
      }
      db.exec(`UPDATE memories SET recorded_at = COALESCE(recorded_at, created_at)`);
      db.exec(`UPDATE memory_history SET recorded_at = COALESCE(recorded_at, changed_at)`);
    },
  },
  {
    version: 6,
    name: "review-suppressions",
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_candidates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject TEXT NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          importance REAL NOT NULL DEFAULT 0.5,
          theme TEXT,
          project TEXT NOT NULL DEFAULT '',
          provenance TEXT,
          trust TEXT NOT NULL DEFAULT 'inferred',
          evidence TEXT,
          valid_from TEXT,
          valid_until TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          rejection_reason TEXT,
          created_at TEXT NOT NULL,
          reviewed_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_candidates_status ON memory_candidates(project, status, created_at);
        CREATE TABLE IF NOT EXISTS memory_suppressions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_key TEXT NOT NULL,
          predicate_key TEXT NOT NULL,
          object_key TEXT NOT NULL,
          project TEXT NOT NULL DEFAULT '',
          reason TEXT,
          source_candidate_id INTEGER,
          created_at TEXT NOT NULL,
          expires_at TEXT,
          UNIQUE(subject_key, predicate_key, object_key, project)
        );
        CREATE INDEX IF NOT EXISTS idx_suppressions_lookup
          ON memory_suppressions(project, subject_key, predicate_key, object_key);
      `);
    },
  },
];

export const HEAD_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export interface BackupPayload {
  format: "memsem-backup";
  formatVersion: number;
  exportedAt: string;
  dbVersion: number;
  project: string | null;
  memories: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  episodes: Array<Record<string, unknown>>;
  candidates: Array<Record<string, unknown>>;
  suppressions: Array<Record<string, unknown>>;
}

export class MemoryDb {
  private db: DatabaseSync;
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const existed = fs.existsSync(filePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.migrate(existed);
  }

  private migrate(existed: boolean): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = new Set(
      (this.db.prepare(`SELECT version FROM schema_migrations`).all() as Array<{ version: number }>).map((r) => r.version),
    );
    const pending = MIGRATIONS.filter((m) => !applied.has(m.version));
    if (pending.length > 0) {
      // Backup automatique avant toute migration — sur une base qui existait déjà.
      if (existed) this.backupBeforeMigration();
      const now = new Date().toISOString();
      for (const migration of pending) {
        this.db.exec("BEGIN");
        try {
          migration.up(this.db);
          this.db
            .prepare(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`)
            .run(migration.version, migration.name, now);
          this.db.exec("COMMIT");
        } catch (err) {
          this.db.exec("ROLLBACK");
          throw err;
        }
      }
    }
  }

  private backupBeforeMigration(): void {
    try {
      const dir = path.dirname(this.filePath);
      const backupsDir = path.join(dir, "backups");
      fs.mkdirSync(backupsDir, { recursive: true });
      // Checkpoint pour fusionner le WAL dans le fichier principal avant la copie.
      try {
        this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      } catch {
        // checkpoint best-effort
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const target = path.join(backupsDir, `memory-${stamp}.db.bak`);
      fs.copyFileSync(this.filePath, target);
      const backups = fs
        .readdirSync(backupsDir)
        .filter((f) => f.endsWith(".db.bak"))
        .sort()
        .reverse();
      for (const old of backups.slice(5)) {
        fs.unlinkSync(path.join(backupsDir, old));
      }
    } catch (err) {
      // Un backup raté ne doit jamais bloquer le démarrage.
      console.error("[memsem] backup avant migration echoue (continuation sans backup):", String(err).slice(0, 200));
    }
  }

  /** Version de schéma atteinte (== HEAD_VERSION après migration). */
  version(): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations`).get() as { v: number };
    return row.v;
  }

  /** Liste des migrations appliquées (audit). */
  appliedMigrations(): Array<{ version: number; name: string; appliedAt: string }> {
    return (
      this.db
        .prepare(`SELECT version, name, applied_at FROM schema_migrations ORDER BY version`)
        .all() as Array<{ version: number; name: string; applied_at: string }>
    ).map((r) => ({ version: r.version, name: r.name, appliedAt: r.applied_at }));
  }

  close(): void {
    this.db.close();
  }

  private memoriesForKey(subject: string, predicate: string, project: string, archived: number | null): MemoryKeyRow[] {
    const match = ftsQuery(`${subject} ${predicate}`);
    const archivedClause = archived === null ? "" : " AND m.archived = ?";
    const params = archived === null ? [match, project] : [match, project, archived];
    const rows = match
      ? (this.db
          .prepare(
        `SELECT m.id, m.subject, m.predicate, m.object, m.tags, m.importance,
                    m.confidence, m.frequency, m.pinned, m.archived, m.provenance,
                    m.trust, m.evidence, m.recorded_at, m.valid_from, m.valid_until
             FROM memories m JOIN memory_fts ON memory_fts.rowid = m.id
             WHERE memory_fts MATCH ? AND m.project = ?${archivedClause}`,
          )
          .all(...params) as unknown as MemoryKeyRow[])
      : (this.db
          .prepare(
             `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, pinned, archived,
                     provenance, trust, evidence, recorded_at, valid_from, valid_until
             FROM memories
             WHERE project = ?${archived === null ? "" : " AND archived = ?"}`,
          )
          .all(...(archived === null ? [project] : [project, archived])) as unknown as MemoryKeyRow[]);
    return rows.filter(
      (row) => normalizeKey(row.subject) === normalizeKey(subject) && normalizeKey(row.predicate) === normalizeKey(predicate),
    );
  }

  private blockedBySuppression(subject: string, predicate: string, object: string, project: string): boolean {
    const row = this.db
      .prepare(
        `SELECT id FROM memory_suppressions
         WHERE subject_key = ? AND predicate_key = ? AND object_key = ? AND project = ?
           AND (expires_at IS NULL OR expires_at > ?)`,
      )
      .get(normalizeKey(subject), normalizeKey(predicate), normalizeKey(object), project, new Date().toISOString());
    return row !== undefined;
  }

  private rejectedAddResult(): AddResult {
    return {
      id: 0,
      created: false,
      changed: false,
      conflict: false,
      resurrected: false,
      confidence: 0,
      frequency: 0,
      faded: [],
      archived: [],
      history: [],
      rejected: true,
      rejectionReason: "suppressed",
    };
  }

  add(input: AddInput): AddResult {
    const now = new Date().toISOString();
    const subject = input.subject.trim();
    const predicate = input.predicate.trim();
    const object = input.object.trim();
    const importance = clamp01(input.importance ?? 0.5);
    const theme = input.theme?.trim().toLowerCase() || null;
    const tags = [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))];
    const trust = normalizeTrust(input.trust);
    const evidence = input.evidence?.trim() || null;
    const validFrom = normalizeDate(input.validFrom, "validFrom");
    const validUntil = normalizeDate(input.validUntil, "validUntil");
    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
      throw new Error("validUntil doit être postérieur à validFrom");
    }

    if (this.blockedBySuppression(subject, predicate, object, input.project)) return this.rejectedAddResult();

    const keyRows = this.memoriesForKey(subject, predicate, input.project, null);
    const rows = keyRows.filter((row) => row.archived === 0);

    const exact = rows.find((r) => normalizeKey(r.object) === normalizeKey(object));

    const rejectedValues = keyRows.length === 0
      ? []
      : (this.db
          .prepare(`SELECT DISTINCT previous FROM memory_history WHERE memory_id IN (${keyRows.map(() => "?").join(",")})`)
          .all(...keyRows.map((row) => row.id)) as Array<{ previous: string }>)
          .filter((r) => normalizeKey(r.previous) === normalizeKey(object));

    if (exact) {
      const faded: number[] = [];
      const archived: number[] = [];
      for (const other of rows) {
        if (other.id === exact.id) continue;
        const outcome = this.fade(other, now);
        if (outcome.untouched) continue;
        if (outcome.archived) archived.push(outcome.id);
        else faded.push(outcome.id);
      }
      const cfg = getConfig();
      const confidence = clamp01(exact.confidence + cfg.reinforceConfidenceStep);
      const mergedTags = [...new Set([...JSON.parse(exact.tags), ...tags])];
      const exactTrust = TRUST_RANK[exact.trust] >= TRUST_RANK[trust] ? exact.trust : trust;
      this.db
        .prepare(
          `UPDATE memories
           SET confidence = ?, frequency = frequency + 1,
               importance = MAX(importance, ?), tags = ?, updated_at = ?,
               pinned = MAX(pinned, ?), theme = COALESCE(theme, ?),
               trust = ?, evidence = COALESCE(?, evidence), recorded_at = ?,
               valid_from = COALESCE(?, valid_from), valid_until = COALESCE(?, valid_until)
           WHERE id = ?`,
        )
        .run(
          confidence,
          importance,
          JSON.stringify(mergedTags),
          now,
          input.pin ? 1 : 0,
          theme,
          exactTrust,
          evidence,
          now,
          validFrom,
          validUntil,
          exact.id,
        );
      const history = this.historyOf(exact.id);
      return {
        id: exact.id,
        created: false,
        changed: false,
        conflict: faded.length + archived.length > 0,
        resurrected: false,
        confidence,
        frequency: exact.frequency + 1,
        faded,
        archived,
        history,
      };
    }

    if (rejectedValues.length > 0) {
      const cfg = getConfig();
      const faded: number[] = [];
      const archived: number[] = [];
      for (const other of rows) {
        const outcome = this.fade(other, now);
        if (outcome.untouched) continue;
        if (outcome.archived) archived.push(outcome.id);
        else faded.push(outcome.id);
      }
      const archivedRow = keyRows.find((r) => r.archived === 1 && normalizeKey(r.object) === normalizeKey(object));
      if (archivedRow) {
        const confidence = clamp01(archivedRow.confidence * cfg.resurrectConfidence + cfg.reinforceConfidenceStep);
        const resurrectTrust = TRUST_RANK[archivedRow.trust] >= TRUST_RANK[trust] ? archivedRow.trust : trust;
        this.db
          .prepare(
            `UPDATE memories SET archived = 0, confidence = ?, frequency = frequency + 1, updated_at = ?,
             trust = ?, evidence = COALESCE(?, evidence), recorded_at = ?,
             valid_from = COALESCE(?, valid_from), valid_until = COALESCE(?, valid_until)
             WHERE id = ?`,
          )
          .run(confidence, now, resurrectTrust, evidence, now, validFrom, validUntil, archivedRow.id);
        this.audit({ entity: "memory", entityId: archivedRow.id, field: "archived", oldValue: "1", newValue: "0", reason: "resurrection" });
        for (const other of rows) {
          this.db
            .prepare(`INSERT OR IGNORE INTO edges (source_id, target_id, relation) VALUES (?, ?, 'contradicts')`)
            .run(archivedRow.id, other.id);
        }
        this.linkMemory(archivedRow.id, subject, object, input.project);
        return {
          id: archivedRow.id,
          created: false,
          changed: true,
          conflict: faded.length + archived.length > 0,
          resurrected: true,
          confidence,
          frequency: archivedRow.frequency + 1,
          faded,
          archived,
          history: this.historyOf(archivedRow.id),
        };
      }
      const info = this.db
        .prepare(
          `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
             created_at, updated_at, pinned, theme, trust, evidence, recorded_at, valid_from, valid_until)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(subject, predicate, object, JSON.stringify(tags), importance, cfg.resurrectConfidence, input.project, input.provenance ?? null, now, now, input.pin ? 1 : 0, theme, trust, evidence, now, validFrom, validUntil);
      const id = Number(info.lastInsertRowid);
      for (const other of rows) {
        this.db
          .prepare(`INSERT OR IGNORE INTO edges (source_id, target_id, relation) VALUES (?, ?, 'contradicts')`)
          .run(id, other.id);
      }
      this.linkMemory(id, subject, object, input.project);
      return {
        id,
        created: true,
        changed: true,
        conflict: faded.length + archived.length > 0,
        resurrected: true,
        confidence: cfg.resurrectConfidence,
        frequency: 1,
        faded,
        archived,
        history: [],
      };
    }

    if (rows.length > 0) {
      const faded: number[] = [];
      const archived: number[] = [];
      for (const other of rows) {
        const outcome = this.fade(other, now);
        if (outcome.untouched) continue;
        if (outcome.archived) archived.push(outcome.id);
        else faded.push(outcome.id);
      }
      const cfg = getConfig();
      const info = this.db
        .prepare(
          `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
             created_at, updated_at, pinned, theme, trust, evidence, recorded_at, valid_from, valid_until)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(subject, predicate, object, JSON.stringify(tags), importance, cfg.supersedeConfidence, input.project, input.provenance ?? null, now, now, input.pin ? 1 : 0, theme, trust, evidence, now, validFrom, validUntil);
      const id = Number(info.lastInsertRowid);
      for (const other of rows) {
        this.db
          .prepare(`INSERT OR IGNORE INTO edges (source_id, target_id, relation) VALUES (?, ?, 'contradicts')`)
          .run(id, other.id);
      }
      this.linkMemory(id, subject, object, input.project);
      return {
        id,
        created: true,
        changed: true,
        conflict: true,
        resurrected: false,
        confidence: cfg.supersedeConfidence,
        frequency: 1,
        faded,
        archived,
        history: [],
      };
    }

    const cfg = getConfig();
    const info = this.db
      .prepare(
        `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
           created_at, updated_at, pinned, theme, trust, evidence, recorded_at, valid_from, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(subject, predicate, object, JSON.stringify(tags), importance, cfg.initialConfidence, input.project, input.provenance ?? null, now, now, input.pin ? 1 : 0, theme, trust, evidence, now, validFrom, validUntil);
    const id = Number(info.lastInsertRowid);
    this.linkMemory(id, subject, object, input.project);
    return {
      id,
      created: true,
      changed: false,
      conflict: false,
      resurrected: false,
      confidence: cfg.initialConfidence,
      frequency: 1,
      faded: [],
      archived: [],
      history: [],
    };
  }

  private linkMemory(id: number, subject: string, object: string, project: string): void {
    const match = ftsQuery(`${subject} ${object}`);
    const others = match
      ? (this.db
          .prepare(
            `SELECT m.id, m.subject, m.object
             FROM memories m JOIN memory_fts ON memory_fts.rowid = m.id
             WHERE memory_fts MATCH ? AND m.project = ? AND m.archived = 0 AND m.id != ?`,
          )
          .all(match, project, id) as Array<{ id: number; subject: string; object: string }>)
      : (this.db
          .prepare(
            `SELECT id, subject, object FROM memories
             WHERE project = ? AND archived = 0 AND id != ?
               AND (lower(trim(subject)) IN (?, ?) OR lower(trim(object)) = ?)`,
          )
          .all(project, id, normalizeKey(subject), normalizeKey(object), normalizeKey(subject)) as Array<{
          id: number;
          subject: string;
          object: string;
        }>);
    const key = normalizeKey;
    for (const other of others) {
      const linked =
        key(other.subject) === key(subject) ||
        key(other.object) === key(subject) ||
        key(other.subject) === key(object);
      if (linked) {
        this.db
          .prepare(
            `INSERT OR IGNORE INTO edges (source_id, target_id) VALUES (?, ?)`,
          )
          .run(id, other.id);
      }
    }
  }

  private fade(
    row: {
      id: number;
      object: string;
      confidence: number;
      importance: number;
      pinned: number;
      trust: MemoryTrust;
      evidence: string | null;
      valid_from: string | null;
      valid_until: string | null;
    },
    now: string,
  ): { id: number; archived: boolean; untouched: boolean } {
    if (row.pinned === 1) return { id: row.id, archived: false, untouched: true };
    const cfg = getConfig();
    if (row.importance >= cfg.criticalImportance) {
      const next = Math.max(row.confidence * cfg.criticalFadeFactor, cfg.archiveThreshold + 0.01);
      this.db.prepare(`UPDATE memories SET confidence = ? WHERE id = ?`).run(next, row.id);
      return { id: row.id, archived: false, untouched: false };
    }
    const next = row.confidence * cfg.fadeFactor;
    if (next < cfg.archiveThreshold) {
      this.db
        .prepare(`UPDATE memories SET archived = 1, updated_at = ? WHERE id = ?`)
        .run(now, row.id);
      this.db
        .prepare(
          `INSERT INTO memory_history
             (memory_id, previous, changed_at, previous_trust, previous_evidence, previous_valid_from, previous_valid_until, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(row.id, row.object, now, row.trust, row.evidence, row.valid_from, row.valid_until, now);
      this.audit({ entity: "memory", entityId: row.id, field: "archived", oldValue: "0", newValue: "1", reason: "supersession" });
      return { id: row.id, archived: true, untouched: false };
    }
    this.db.prepare(`UPDATE memories SET confidence = ? WHERE id = ?`).run(next, row.id);
    return { id: row.id, archived: false, untouched: false };
  }

  private historyOf(memoryId: number): Array<{
    previous: string;
    changedAt: string;
    trust?: MemoryTrust;
    evidence?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
  }> {
    return (
      this.db
        .prepare(
          `SELECT previous, changed_at, previous_trust, previous_evidence, previous_valid_from, previous_valid_until
           FROM memory_history WHERE memory_id = ? ORDER BY changed_at DESC`,
        )
        .all(memoryId) as Array<{
        previous: string;
        changed_at: string;
        previous_trust: MemoryTrust | null;
        previous_evidence: string | null;
        previous_valid_from: string | null;
        previous_valid_until: string | null;
      }>
    ).map((h) => ({
      previous: h.previous,
      changedAt: h.changed_at,
      trust: h.previous_trust ?? undefined,
      evidence: h.previous_evidence,
      validFrom: h.previous_valid_from,
      validUntil: h.previous_valid_until,
    }));
  }

  addMany(inputs: AddInput[]): AddResult[] {
    this.db.exec("BEGIN");
    try {
      const results = inputs.map((i) => this.add(i));
      this.db.exec("COMMIT");
      return results;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  private priorityOf(row: { importance: number; confidence: number; frequency: number; updated_at: string }): number {
    const ageHours = (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000;
    return computePriority({
      importance: row.importance,
      confidence: row.confidence,
      frequency: row.frequency,
      ageHours,
    });
  }

  private whereClause(
    project: string | null,
    theme: string | null,
    crossProject = false,
    asOf: string | null = null,
  ): { sql: string; params: (string | number)[] } {
    const effectiveAsOf = asOf ?? new Date().toISOString();
    const clauses: string[] = asOf ? ["(archived = 0 OR updated_at > ?)"] : ["archived = 0"];
    const params: (string | number)[] = [];
    if (asOf) params.push(effectiveAsOf);
    if (theme) {
      clauses.push("(theme = ? OR theme LIKE ?)");
      params.push(theme, `${theme}/%`);
      if (project && !crossProject) {
        clauses.push("project = ?");
        params.push(project);
      }
    } else if (project) {
      clauses.push("project = ?");
      params.push(project);
    }
    clauses.push("(valid_from IS NULL OR valid_from <= ?)");
    clauses.push("(valid_until IS NULL OR valid_until > ?)");
    params.push(effectiveAsOf, effectiveAsOf);
    return { sql: clauses.join(" AND "), params };
  }

  private inFocus(theme: string | null, focus: string[] | null): boolean {
    if (!focus || focus.length === 0) return true;
    if (!theme) return false;
    return focus.some((f) => theme === f || theme.startsWith(`${f}/`));
  }

  private reweight(hits: SearchHit[], focus: string[] | null): SearchHit[] {
    if (!focus || focus.length === 0) return hits;
    const attenuation = getConfig().focusAttenuation;
    return hits.map((h) => (this.inFocus(h.theme, focus) ? h : { ...h, score: h.score * attenuation }));
  }

  async search(
    query: string,
    project: string | null,
    theme: string | null,
    limit: number,
    relax = false,
    focus: string[] | null = null,
    crossProject = false,
    asOf: string | null = null,
  ): Promise<SearchHit[]> {
    const normalizedAsOf = asOf ? normalizeDate(asOf, "asOf") : null;
    const where = this.whereClause(project, theme, crossProject, normalizedAsOf);
    const match = ftsQuery(query);
    const rows = match
      ? (this.db
          .prepare(
            `SELECT m.id, m.subject, m.predicate, m.object, m.tags, m.importance, m.confidence,
                    m.frequency, m.project, m.provenance, m.trust, m.evidence, m.recorded_at,
                    m.valid_from, m.valid_until, m.pinned, m.theme, m.updated_at
             FROM memories m JOIN memory_fts ON memory_fts.rowid = m.id
             WHERE memory_fts MATCH ? AND ${where.sql}`,
          )
          .all(match, ...where.params) as Array<{
            id: number;
            subject: string;
            predicate: string;
            object: string;
            tags: string;
            importance: number;
            confidence: number;
            frequency: number;
            project: string;
            provenance: string | null;
            trust: MemoryTrust;
            evidence: string | null;
            recorded_at: string | null;
            valid_from: string | null;
            valid_until: string | null;
            pinned: number;
            theme: string | null;
            updated_at: string;
          }>)
      : [];
    const hits: SearchHit[] = [];
    for (const row of rows) {
      const tags = JSON.parse(row.tags) as string[];
      hits.push({
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        tags,
        importance: row.importance,
        confidence: row.confidence,
        frequency: row.frequency,
        project: row.project,
        provenance: row.provenance,
        trust: row.trust,
        evidence: row.evidence,
        recordedAt: row.recorded_at ?? row.updated_at,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        pinned: row.pinned === 1,
        theme: row.theme,
        priority: this.priorityOf(row),
        score: 0,
      });
    }
    let withBase = hits.map((h) => ({ ...h, score: searchScore(query, h), lexical: lexicalScore(query, h) }));
    const seeded = withBase
      .filter((h) => h.lexical > 0 && (relax || h.lexical >= minLexical()))
      .sort((a, b) => b.score - a.score);
    if (!relax) return this.reweight(seeded, focus).sort((a, b) => b.score - a.score).slice(0, limit);
    if (seeded.length === 0) {
      return (await this.semanticCandidates(query, project, theme, limit, crossProject, normalizedAsOf)).slice(0, limit);
    }
    const best = seeded[0].score;
    let frontier = seeded;
    const activated = new Set<number>(seeded.map((h) => h.id));
    const cfg = getConfig();
    for (let hop = 1; hop <= cfg.relaxGraphHops; hop++) {
      const ids = [...new Set(frontier.map((h) => h.id))];
      if (ids.length === 0) break;
      const placeholders = ids.map(() => "?").join(",");
      const edges = this.db
        .prepare(
          `SELECT source_id, target_id FROM edges
           WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
        )
        .all(...ids, ...ids) as Array<{ source_id: number; target_id: number }>;
      const neighbors = new Set<number>();
      for (const e of edges) {
        neighbors.add(e.source_id);
        neighbors.add(e.target_id);
      }
      const idsToLoad = [...neighbors].filter((id) => !activated.has(id));
      const next: Array<typeof withBase[number]> = [];
      if (idsToLoad.length > 0) {
        const neighborRows = this.db
          .prepare(
             `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project,
                     provenance, trust, evidence, recorded_at, valid_from, valid_until, pinned, theme, updated_at
             FROM memories WHERE id IN (${idsToLoad.map(() => "?").join(",")}) AND ${where.sql}`,
          )
          .all(...idsToLoad, ...where.params) as Array<{
          id: number;
          subject: string;
          predicate: string;
          object: string;
          tags: string;
          importance: number;
          confidence: number;
          frequency: number;
          project: string;
          pinned: number;
          theme: string | null;
           updated_at: string;
           provenance: string | null;
           trust: MemoryTrust;
           evidence: string | null;
           recorded_at: string | null;
           valid_from: string | null;
           valid_until: string | null;
        }>;
        for (const row of neighborRows) {
          const h = {
            id: row.id,
            subject: row.subject,
            predicate: row.predicate,
            object: row.object,
            project: row.project,
            provenance: row.provenance,
            trust: row.trust,
            evidence: row.evidence,
            recordedAt: row.recorded_at ?? row.updated_at,
            validFrom: row.valid_from,
            validUntil: row.valid_until,
            pinned: row.pinned === 1,
            tags: JSON.parse(row.tags) as string[],
            importance: row.importance,
            confidence: row.confidence,
            frequency: row.frequency,
            theme: row.theme,
            priority: this.priorityOf(row),
            score: best * Math.pow(cfg.relaxGraphBoost, hop),
            lexical: 0,
          };
          activated.add(h.id);
          next.push(h);
        }
        withBase = [...withBase, ...next];
      }
      frontier = next;
    }
    const base = withBase
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
    if (base.length === 0) {
      return this.reweight(await this.semanticCandidates(query, project, theme, limit, crossProject, normalizedAsOf), focus).slice(0, limit);
    }
    const semantic = await this.semanticCandidates(query, project, theme, limit, crossProject, normalizedAsOf);
    const merged: SearchHit[] = [...base];
    const seen = new Set(base.map((h) => h.id));
    for (const s of semantic) {
      if (!seen.has(s.id)) {
        merged.push(s);
        seen.add(s.id);
      }
    }
    return this.reweight(merged, focus).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  async refreshEmbedding(id: number): Promise<void> {
    if (!(await ollamaAvailable())) return;
    const row = this.db
      .prepare(
        `SELECT subject, predicate, object, tags, theme FROM memories WHERE id = ? AND archived = 0`,
      )
      .get(id) as
      | { subject: string; predicate: string; object: string; tags: string; theme: string | null }
      | undefined;
    if (!row) return;
    const text = [row.subject, row.predicate, row.object, ...JSON.parse(row.tags), row.theme]
      .filter(Boolean)
      .join(", ");
    const vec = await embed(text);
    if (vec) {
      this.db.prepare(`UPDATE memories SET embedding = ? WHERE id = ?`).run(JSON.stringify(vec), id);
    }
  }

  memoriesWithoutEmbedding(): number[] {
    return (
      this.db
        .prepare(`SELECT id FROM memories WHERE archived = 0 AND embedding IS NULL`)
        .all() as Array<{ id: number }>
    ).map((r) => r.id);
  }

  private async semanticCandidates(
    query: string,
    project: string | null,
    theme: string | null,
    limit: number,
    crossProject = false,
    asOf: string | null = null,
  ): Promise<SearchHit[]> {
    if (!(await ollamaAvailable())) return [];
    const qv = await embed(query);
    if (!qv) return [];
    const where = this.whereClause(project, theme, crossProject, asOf);
    // ponytail: cosine over stored JSON is O(n); add a SQLite vector extension only when corpus size justifies it.
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project,
                provenance, trust, evidence, recorded_at, valid_from, valid_until,
                pinned, theme, embedding, updated_at
         FROM memories WHERE ${where.sql} AND embedding IS NOT NULL`,
      )
      .all(...where.params) as Array<{
      id: number;
      subject: string;
      predicate: string;
      object: string;
      tags: string;
      importance: number;
      confidence: number;
      frequency: number;
      project: string;
      provenance: string | null;
      trust: MemoryTrust;
      evidence: string | null;
      recorded_at: string | null;
      valid_from: string | null;
      valid_until: string | null;
      pinned: number;
      theme: string | null;
      embedding: string;
      updated_at: string;
    }>;
    return rows
      .map((row) => {
        const sim = cosine(qv, JSON.parse(row.embedding) as number[]);
        return { row, sim };
      })
      .filter((x) => x.sim >= getConfig().relaxCosineThreshold)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, limit)
      .map(({ row, sim }) => ({
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        tags: JSON.parse(row.tags) as string[],
        importance: row.importance,
        confidence: row.confidence,
        frequency: row.frequency,
        project: row.project,
        provenance: row.provenance,
        trust: row.trust,
        evidence: row.evidence,
        recordedAt: row.recorded_at ?? row.updated_at,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        pinned: row.pinned === 1,
        theme: row.theme,
        priority: this.priorityOf(row),
        score: sim * getConfig().relaxSemanticWeight,
      }));
  }

  list(
    project: string | null,
    theme: string | null,
    limit: number,
    focus: string[] | null = null,
    crossProject = false,
    asOf: string | null = null,
  ): SearchHit[] {
    const normalizedAsOf = asOf ? normalizeDate(asOf, "asOf") : null;
    const where = this.whereClause(project, theme, crossProject, normalizedAsOf);
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project,
                provenance, trust, evidence, recorded_at, valid_from, valid_until, pinned, theme, updated_at
         FROM memories WHERE ${where.sql}`,
      )
      .all(...where.params) as Array<{
      id: number;
      subject: string;
      predicate: string;
      object: string;
      tags: string;
      importance: number;
      confidence: number;
      frequency: number;
      project: string;
      provenance: string | null;
      trust: MemoryTrust;
      evidence: string | null;
      recorded_at: string | null;
      valid_from: string | null;
      valid_until: string | null;
      pinned: number;
      theme: string | null;
      updated_at: string;
    }>;
    return rows
      .map((row) => ({
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        tags: JSON.parse(row.tags) as string[],
        importance: row.importance,
        confidence: row.confidence,
        frequency: row.frequency,
        project: row.project,
        provenance: row.provenance,
        trust: row.trust,
        evidence: row.evidence,
        recordedAt: row.recorded_at ?? row.updated_at,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        pinned: row.pinned === 1,
        theme: row.theme,
        priority: this.priorityOf(row),
        score: 0,
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.priority - a.priority)
      .map((m) => (this.inFocus(m.theme, focus) ? m : { ...m, priority: m.priority * getConfig().focusAttenuation }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.priority - a.priority)
      .slice(0, limit);
  }

  stats(): Record<string, unknown> {
    const count = (sql: string): number => (this.db.prepare(sql).get() as { n: number }).n;
    const top = this.list(null, null, 5).map((m) => ({
      subject: m.subject,
      predicate: m.predicate,
      object: m.object,
      pinned: m.pinned,
      priority: m.priority,
    }));
    const history = (
      this.db
        .prepare(
          `SELECT m.subject, m.predicate, h.previous, h.changed_at
           FROM memory_history h JOIN memories m ON m.id = h.memory_id
           ORDER BY h.changed_at DESC LIMIT 5`,
        )
        .all() as Array<{ subject: string; predicate: string; previous: string; changed_at: string }>
    ).map((h) => ({ subject: h.subject, predicate: h.predicate, previous: h.previous, changedAt: h.changed_at }));
    return {
      memoriesActive: count(`SELECT COUNT(*) AS n FROM memories WHERE archived = 0`),
      memoriesArchived: count(`SELECT COUNT(*) AS n FROM memories WHERE archived = 1`),
      pinned: count(`SELECT COUNT(*) AS n FROM memories WHERE pinned = 1 AND archived = 0`),
      episodes: count(`SELECT COUNT(*) AS n FROM episodes`),
      candidatesPending: count(`SELECT COUNT(*) AS n FROM memory_candidates WHERE status = 'pending'`),
      suppressions: count(`SELECT COUNT(*) AS n FROM memory_suppressions WHERE expires_at IS NULL OR expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`),
      edges: count(`SELECT COUNT(*) AS n FROM edges`),
      themes: this.themes(),
      topByPriority: top,
      recentHistory: history,
    };
  }

  themes(): Array<{ theme: string; count: number }> {
    return (
      this.db
        .prepare(
          `SELECT theme, COUNT(*) AS n FROM memories
           WHERE archived = 0 AND theme IS NOT NULL
           GROUP BY theme ORDER BY n DESC`,
        )
        .all() as Array<{ theme: string; n: number }>
    ).map((t) => ({ theme: t.theme, count: t.n }));
  }

  indexMarkdown(): string {
    const rows = this.db
      .prepare(
        `SELECT subject, predicate, object, tags, importance, project, pinned, theme
         FROM memories WHERE archived = 0 ORDER BY pinned DESC, frequency DESC`,
      )
      .all() as Array<{
      subject: string;
      predicate: string;
      object: string;
      tags: string;
      importance: number;
      project: string;
      pinned: number;
      theme: string | null;
    }>;
    if (rows.length === 0) {
      return "# Index mémoire (memsem)\n\nAucune mémoire pour l'instant.";
    }
    const lines: string[] = ["# Index mémoire (memsem)", "", "Généré automatiquement — l'index de routage. Cherche par thème via memory_search."];
    const pinned = rows.filter((r) => r.pinned === 1);
    if (pinned.length > 0) {
      lines.push("", "## Épinglées (toujours en contexte)", "");
      for (const r of pinned) lines.push(`- \`${r.subject} → ${r.predicate} → ${r.object}\` (${r.project})`);
    }
    const byTheme = new Map<string, Array<typeof rows[number]>>();
    const unthemed: Array<typeof rows[number]> = [];
    for (const r of rows) {
      if (r.theme) {
        const list = byTheme.get(r.theme) ?? [];
        list.push(r);
        byTheme.set(r.theme, list);
      } else {
        unthemed.push(r);
      }
    }
    lines.push("", `## Thèmes (${rows.length - unthemed.length} mémoires)`, "");
    for (const [theme, mems] of [...byTheme.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const keywords = new Set<string>();
      for (const m of mems) {
        for (const t of tokenize(`${m.object} ${m.tags}`)) keywords.add(t);
      }
      const kw = [...keywords].slice(0, 6).join(", ");
      lines.push(`- **${theme}** (${mems.length}) : ${kw}`);
    }
    if (unthemed.length > 0) {
      lines.push("", "## Sans thème (recherche libre)", "");
      for (const r of unthemed.slice(0, 5)) {
        lines.push(`- \`${r.subject} → ${r.predicate} → ${r.object}\` (${r.project}, imp ${r.importance})`);
      }
    }
    return lines.join("\n");
  }

  forget(id: number, reason?: string): boolean {
    const row = this.db.prepare(`SELECT subject, predicate, object FROM memories WHERE id = ? AND archived = 0`).get(id) as
      | { subject: string; predicate: string; object: string }
      | undefined;
    const info = this.db.prepare(`UPDATE memories SET archived = 1, updated_at = ? WHERE id = ? AND archived = 0`).run(new Date().toISOString(), id);
    if (info.changes > 0) {
      this.audit({
        entity: "memory",
        entityId: id,
        field: "archived",
        oldValue: "0",
        newValue: "1",
        reason: reason ?? "forget",
      });
    }
    return info.changes > 0 && row !== undefined;
  }

  /** Lecture d'une mémoire (active ou archivée) — CLI list/edit/forget. */
  get(id: number): MemoryRecord | null {
    const row = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
                trust, evidence, recorded_at, valid_from, valid_until,
                archived, created_at, updated_at, pinned, theme
         FROM memories WHERE id = ?`,
      )
      .get(id) as
      | {
          id: number;
          subject: string;
          predicate: string;
          object: string;
          tags: string;
          importance: number;
          confidence: number;
          frequency: number;
          project: string;
          provenance: string | null;
          trust: MemoryTrust;
          evidence: string | null;
          recorded_at: string | null;
          valid_from: string | null;
          valid_until: string | null;
          archived: number;
          created_at: string;
          updated_at: string;
          pinned: number;
          theme: string | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      subject: row.subject,
      predicate: row.predicate,
      object: row.object,
      tags: JSON.parse(row.tags) as string[],
      importance: row.importance,
      confidence: row.confidence,
      frequency: row.frequency,
      project: row.project,
      provenance: row.provenance,
      trust: row.trust,
      evidence: row.evidence,
      recordedAt: row.recorded_at ?? row.created_at,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archived: row.archived === 1,
      pinned: row.pinned === 1,
      theme: row.theme,
    };
  }

  verify(id: number, evidence: string, reason = "human-verify"): MemoryRecord | null {
    const before = this.get(id);
    if (!before || before.archived) return null;
    const proof = evidence.trim();
    if (!proof) throw new Error("evidence requise pour vérifier une mémoire");
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE memories SET trust = 'verified', evidence = ?, recorded_at = ?, updated_at = ? WHERE id = ? AND archived = 0`)
      .run(proof, now, now, id);
    this.audit({ entity: "memory", entityId: id, field: "trust", oldValue: before.trust, newValue: "verified", reason });
    this.audit({ entity: "memory", entityId: id, field: "evidence", oldValue: before.evidence, newValue: proof, reason });
    return this.get(id);
  }

  /** Correction manuelle d'un fait (CLI memsem edit) : champs fournis seulement,
   *  chaque changement audité. Un fait archivé est immuable. */
  edit(
    id: number,
    fields: { subject?: string; predicate?: string; object?: string; importance?: number; theme?: string | null; tags?: string[]; pin?: boolean },
  ): { before: MemoryRecord; after: MemoryRecord } | null {
    const before = this.get(id);
    if (!before || before.archived) return null;
    const now = new Date().toISOString();
    const changes: Array<{ field: string; oldValue: string; newValue: string }> = [];
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    const apply = (field: string, value: string | number | null, oldValue: string, toSql: (v: string | number | null) => string | number | null) => {
      sets.push(`${field} = ?`);
      params.push(toSql(value));
      changes.push({ field, oldValue, newValue: String(value) });
    };

    if (fields.subject !== undefined && fields.subject.trim() !== before.subject) {
      apply("subject", fields.subject.trim(), before.subject, (v) => String(v));
    }
    if (fields.predicate !== undefined && fields.predicate.trim() !== before.predicate) {
      apply("predicate", fields.predicate.trim(), before.predicate, (v) => String(v));
    }
    if (fields.object !== undefined && fields.object.trim() !== before.object) {
      apply("object", fields.object.trim(), before.object, (v) => String(v));
    }
    if (fields.importance !== undefined && fields.importance !== before.importance) {
      apply("importance", clamp01(fields.importance), String(before.importance), (v) => Number(v));
    }
    if (fields.theme !== undefined && (fields.theme ?? null) !== before.theme) {
      const theme = fields.theme?.trim().toLowerCase() || null;
      apply("theme", theme, String(before.theme), (v) => (v === null ? null : String(v)));
    }
    if (fields.tags !== undefined) {
      const tags = [...new Set(fields.tags.map((t) => t.trim()).filter(Boolean))];
      if (JSON.stringify(tags) !== JSON.stringify(before.tags)) {
        apply("tags", JSON.stringify(tags), JSON.stringify(before.tags), (v) => String(v));
      }
    }
    if (fields.pin !== undefined && fields.pin !== before.pinned) {
      apply("pinned", fields.pin ? 1 : 0, before.pinned ? "true" : "false", (v) => Number(v));
    }

    if (changes.length === 0) return { before, after: before };
    sets.push("updated_at = ?");
    params.push(now);
    params.push(id);
    this.db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    for (const change of changes) {
      this.audit({ entity: "memory", entityId: id, field: change.field, oldValue: change.oldValue, newValue: change.newValue, reason: "cli-edit" });
    }
    const after = this.get(id);
    return after ? { before, after } : null;
  }

  /** Faits actifs ou tous (archivés inclus), triés par priorité — CLI list. */
  listAll(includeArchived: boolean, limit: number): Array<MemoryRecord & { priority: number }> {
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
                trust, evidence, recorded_at, valid_from, valid_until,
                archived, created_at, updated_at, pinned, theme
         FROM memories ${includeArchived ? "" : "WHERE archived = 0"}
         ORDER BY pinned DESC, updated_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{
      id: number;
      subject: string;
      predicate: string;
      object: string;
      tags: string;
      importance: number;
      confidence: number;
      frequency: number;
      project: string;
      provenance: string | null;
      trust: MemoryTrust;
      evidence: string | null;
      recorded_at: string | null;
      valid_from: string | null;
      valid_until: string | null;
      archived: number;
      created_at: string;
      updated_at: string;
      pinned: number;
      theme: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      tags: JSON.parse(r.tags) as string[],
      importance: r.importance,
      confidence: r.confidence,
      frequency: r.frequency,
      project: r.project,
      provenance: r.provenance,
      trust: r.trust,
      evidence: r.evidence,
      recordedAt: r.recorded_at ?? r.created_at,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      archived: r.archived === 1,
      pinned: r.pinned === 1,
      theme: r.theme,
      priority: this.priorityOf(r),
    }));
  }

  addCandidate(input: CandidateInput): { id: number; status: "pending" } {
    const subject = input.subject.trim();
    const predicate = input.predicate.trim();
    const object = input.object.trim();
    const theme = input.theme?.trim().toLowerCase() || null;
    const tags = [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))];
    const trust = normalizeTrust(input.trust);
    const evidence = input.evidence?.trim() || null;
    const validFrom = normalizeDate(input.validFrom, "validFrom");
    const validUntil = normalizeDate(input.validUntil, "validUntil");
    if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) {
      throw new Error("validUntil doit être postérieur à validFrom");
    }
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO memory_candidates
           (subject, predicate, object, tags, importance, theme, project, provenance, trust, evidence, valid_from, valid_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        subject,
        predicate,
        object,
        JSON.stringify(tags),
        clamp01(input.importance ?? 0.5),
        theme,
        input.project,
        input.provenance ?? null,
        trust,
        evidence,
        validFrom,
        validUntil,
        now,
      );
    const id = Number(info.lastInsertRowid);
    this.audit({ entity: "candidate", entityId: id, field: "status", oldValue: null, newValue: "pending", reason: "candidate-add" });
    return { id, status: "pending" };
  }

  listCandidates(project: string | null, status: MemoryCandidate["status"] | null, limit: number, id: number | null = null): MemoryCandidate[] {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (project) {
      clauses.push("project = ?");
      params.push(project);
    }
    if (status) {
      clauses.push("status = ?");
      params.push(status);
    }
    if (id !== null) {
      clauses.push("id = ?");
      params.push(id);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db
      .prepare(`SELECT * FROM memory_candidates ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      subject: String(row.subject),
      predicate: String(row.predicate),
      object: String(row.object),
      tags: JSON.parse(String(row.tags)) as string[],
      importance: Number(row.importance),
      theme: row.theme ? String(row.theme) : null,
      project: String(row.project),
      provenance: row.provenance ? String(row.provenance) : null,
      trust: normalizeTrust(String(row.trust)),
      evidence: row.evidence ? String(row.evidence) : null,
      validFrom: row.valid_from ? String(row.valid_from) : null,
      validUntil: row.valid_until ? String(row.valid_until) : null,
      status: String(row.status) as MemoryCandidate["status"],
      rejectionReason: row.rejection_reason ? String(row.rejection_reason) : null,
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    }));
  }

  reviewCandidate(id: number, decision: "approve" | "reject", reason?: string): { id: number; status: "approved" | "rejected"; memoryId: number | null } {
    const candidate = this.listCandidates(null, "pending", 1, id)[0];
    if (!candidate) throw new Error("candidat introuvable ou déjà traité");
    const now = new Date().toISOString();
    if (decision === "approve") {
      const result = this.add({
        subject: candidate.subject,
        predicate: candidate.predicate,
        object: candidate.object,
        tags: candidate.tags,
        importance: candidate.importance,
        theme: candidate.theme ?? undefined,
        project: candidate.project,
        provenance: candidate.provenance ?? undefined,
        trust: candidate.trust,
        evidence: candidate.evidence ?? undefined,
        validFrom: candidate.validFrom ?? undefined,
        validUntil: candidate.validUntil ?? undefined,
      });
      if (result.rejected) throw new Error("candidat bloqué par une suppression active");
      this.db
        .prepare(`UPDATE memory_candidates SET status = 'approved', reviewed_at = ?, rejection_reason = NULL WHERE id = ?`)
        .run(now, id);
      this.audit({ entity: "candidate", entityId: id, field: "status", oldValue: "pending", newValue: "approved", reason: reason ?? "human-approve" });
      return { id, status: "approved", memoryId: result.id };
    }

    this.db
      .prepare(
        `INSERT INTO memory_suppressions
           (subject_key, predicate_key, object_key, project, reason, source_candidate_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(subject_key, predicate_key, object_key, project) DO UPDATE SET
           reason = excluded.reason, source_candidate_id = excluded.source_candidate_id, created_at = excluded.created_at`,
      )
      .run(
        normalizeKey(candidate.subject),
        normalizeKey(candidate.predicate),
        normalizeKey(candidate.object),
        candidate.project,
        reason ?? "human-reject",
        id,
        now,
      );
    this.db
      .prepare(`UPDATE memory_candidates SET status = 'rejected', reviewed_at = ?, rejection_reason = ? WHERE id = ?`)
      .run(now, reason ?? "human-reject", id);
    this.audit({ entity: "candidate", entityId: id, field: "status", oldValue: "pending", newValue: "rejected", reason: reason ?? "human-reject" });
    return { id, status: "rejected", memoryId: null };
  }

  unsuppress(subject: string, predicate: string, object: string, project: string): boolean {
    const rows = this.db
      .prepare(
        `SELECT id FROM memory_suppressions
         WHERE subject_key = ? AND predicate_key = ? AND object_key = ? AND project = ?`,
      )
      .all(normalizeKey(subject), normalizeKey(predicate), normalizeKey(object), project) as Array<{ id: number }>;
    if (rows.length === 0) return false;
    this.db
      .prepare(
        `DELETE FROM memory_suppressions
         WHERE subject_key = ? AND predicate_key = ? AND object_key = ? AND project = ?`,
      )
      .run(normalizeKey(subject), normalizeKey(predicate), normalizeKey(object), project);
    for (const row of rows) {
      this.audit({ entity: "suppression", entityId: row.id, field: "status", oldValue: "active", newValue: "removed", reason: "unsuppress" });
    }
    return true;
  }

  auditLog(entityId: number | null = null, limit = 50): Array<{
    id: number;
    entity: string;
    entityId: number;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    passId: string | null;
    dryRun: boolean;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, entity, entity_id, field, old_value, new_value, reason, pass_id, dry_run, created_at
         FROM audit_log ${entityId === null ? "" : "WHERE entity_id = ?"}
         ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(...(entityId === null ? [limit] : [entityId, limit])) as Array<{
      id: number;
      entity: string;
      entity_id: number;
      field: string;
      old_value: string | null;
      new_value: string | null;
      reason: string | null;
      pass_id: string | null;
      dry_run: number;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      entity: row.entity,
      entityId: row.entity_id,
      field: row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      passId: row.pass_id,
      dryRun: row.dry_run === 1,
      createdAt: row.created_at,
    }));
  }

  purge(id: number, reason = "purge"): boolean {
    const exists = this.db.prepare(`SELECT id FROM memories WHERE id = ?`).get(id);
    if (!exists) return false;
    this.db
      .prepare(`UPDATE audit_log SET old_value = '[redacted]', new_value = '[redacted]' WHERE entity = 'memory' AND entity_id = ?`)
      .run(id);
    this.audit({ entity: "memory", entityId: id, field: "purged", oldValue: null, newValue: "[redacted]", reason });
    return (this.db.prepare(`DELETE FROM memories WHERE id = ?`).run(id).changes ?? 0) > 0;
  }

  /**
   * Recalibre l'importance (juge). Garde-fous : épinglées et importance ≥ 0.9
   * intouchables, plancher 0.4 / plafond 0.85, variation plafonnée à ±0.15 par
   * appel ET par passe (passId cumulatif). dryRun : logue sans appliquer.
   * Toute modification (appliquée ou non) est consignée dans audit_log.
   */
  setImportance(
    id: number,
    importance: number,
    options: { dryRun?: boolean; reason?: string; passId?: string } = {},
  ):
    | {
        id: number;
        importance: number;
        priority: number;
        applied: boolean;
        refused: string | null;
        clampedDelta: boolean;
      }
    | null {
    const row = this.db
      .prepare(`SELECT importance, confidence, frequency, pinned, updated_at FROM memories WHERE id = ? AND archived = 0`)
      .get(id) as
      | { importance: number; confidence: number; frequency: number; pinned: number; updated_at: string }
      | undefined;
    if (!row) return null;

    const refused = (reason: string): NonNullable<ReturnType<MemoryDb["setImportance"]>> => {
      this.audit({ entity: "memory", entityId: id, field: "importance", oldValue: String(row.importance), newValue: String(importance), reason: `${options.reason ?? "juge"} (refuse: ${reason})`, passId: options.passId, dryRun: options.dryRun ?? false });
      return { id, importance: row.importance, priority: this.priorityOf(row), applied: false, refused: reason, clampedDelta: false };
    };

    // Protections absolues : jamais de dérive sur un fait protégé.
    if (row.pinned === 1) return refused("pinned");
    if (row.importance >= 0.9) return refused("critical-0.9");

    // Bornes globales [0.4, 0.85].
    const target = clamp01(importance);
    const clampedTarget = Math.min(0.85, Math.max(0.4, target));

    // Plafond de variation : ±0.15 par appel.
    let delta = clampedTarget - row.importance;
    const clampedDelta = Math.abs(delta) > 0.15;
    if (clampedDelta) delta = Math.sign(delta) * 0.15;

    // Plafond cumulatif par passe (passId) : la somme des |variations| ≤ 0.15.
    let passDelta = 0;
    if (options.passId) {
      const used = this.db
        .prepare(
          `SELECT COALESCE(SUM(ABS(CAST(new_value AS REAL) - CAST(old_value AS REAL))), 0) AS s
           FROM audit_log WHERE entity_id = ? AND pass_id = ? AND dry_run = 0`,
        )
        .get(id, options.passId) as { s: number };
      passDelta = Number(used.s);
      if (passDelta + Math.abs(delta) > 0.15) {
        const remaining = 0.15 - passDelta;
        delta = remaining > 0 ? Math.sign(delta) * remaining : 0;
      }
    }

    const next = clamp01(row.importance + delta);
    if (options.dryRun) {
      this.audit({ entity: "memory", entityId: id, field: "importance", oldValue: String(row.importance), newValue: String(next), reason: options.reason ?? "juge", passId: options.passId, dryRun: true });
      return { id, importance: next, priority: this.priorityOf({ ...row, importance: next }), applied: false, refused: null, clampedDelta };
    }
    if (next === row.importance) {
      this.audit({ entity: "memory", entityId: id, field: "importance", oldValue: String(row.importance), newValue: String(next), reason: options.reason ?? "juge", passId: options.passId, dryRun: false });
      return { id, importance: row.importance, priority: this.priorityOf(row), applied: false, refused: null, clampedDelta };
    }
    this.db.prepare(`UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?`).run(next, new Date().toISOString(), id);
    this.audit({ entity: "memory", entityId: id, field: "importance", oldValue: String(row.importance), newValue: String(next), reason: options.reason ?? "juge", passId: options.passId, dryRun: false });
    const updated = this.db
      .prepare(`SELECT importance, confidence, frequency, updated_at FROM memories WHERE id = ?`)
      .get(id) as { importance: number; confidence: number; frequency: number; updated_at: string };
    return { id, importance: updated.importance, priority: this.priorityOf(updated), applied: true, refused: null, clampedDelta };
  }

  /** Journal d'audit persistant : qui a changé quoi, quand, pourquoi. */
  audit(entry: {
    entity: string;
    entityId: number;
    field: string;
    oldValue: string | null;
    newValue: string | null;
    reason?: string;
    passId?: string;
    dryRun?: boolean;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO audit_log (entity, entity_id, field, old_value, new_value, reason, pass_id, dry_run, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.entity,
        entry.entityId,
        entry.field,
        entry.oldValue,
        entry.newValue,
        entry.reason ?? null,
        entry.passId ?? null,
        entry.dryRun ? 1 : 0,
        new Date().toISOString(),
      );
    return Number(info.lastInsertRowid);
  }

  /** Faits les plus modifiés récemment (memsem doctor) — repérer une dérive. */
  mostModified(limit = 10, hours = 24): Array<{
    entityId: number;
    subject: string;
    predicate: string;
    object: string;
    changes: number;
    totalDelta: number;
    dryRuns: number;
    lastChange: string;
    lastReason: string | null;
  }> {
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT a.entity_id, m.subject, m.predicate, m.object,
                COUNT(*) AS changes,
                COALESCE(SUM(ABS(CAST(a.new_value AS REAL) - CAST(a.old_value AS REAL))), 0) AS total_delta,
                SUM(a.dry_run) AS dry_runs,
                MAX(a.created_at) AS last_change
         FROM audit_log a JOIN memories m ON m.id = a.entity_id
         WHERE a.created_at >= ? AND a.field = 'importance'
         GROUP BY a.entity_id
         ORDER BY total_delta DESC, changes DESC
         LIMIT ?`,
      )
      .all(since, limit) as Array<{
      entity_id: number;
      subject: string;
      predicate: string;
      object: string;
      changes: number;
      total_delta: number;
      dry_runs: number;
      last_change: string;
    }>;
    const lastReason = this.db.prepare(
      `SELECT reason FROM audit_log WHERE entity_id = ? AND field = 'importance' ORDER BY created_at DESC, id DESC LIMIT 1`,
    );
    return rows.map((r) => ({
      entityId: r.entity_id,
      subject: r.subject,
      predicate: r.predicate,
      object: r.object,
      changes: r.changes,
      totalDelta: r.total_delta,
      dryRuns: r.dry_runs,
      lastChange: r.last_change,
      lastReason: (lastReason.get(r.entity_id) as { reason: string | null } | undefined)?.reason ?? null,
    }));
  }

  addEpisode(input: { project: string; summary: string; provenance?: string }): { id: number } {    const now = new Date().toISOString();
    const info = this.db
      .prepare(`INSERT INTO episodes (project, summary, provenance, created_at) VALUES (?, ?, ?, ?)`)
      .run(input.project, input.summary, input.provenance ?? null, now);
    return { id: Number(info.lastInsertRowid) };
  }

  episodeExists(provenance: string): boolean {
    const row = this.db.prepare(`SELECT id FROM episodes WHERE provenance = ?`).get(provenance);
    return row !== undefined;
  }

  episodeSearch(query: string | null, project: string | null, limit: number): Array<{
    id: number;
    project: string;
    summary: string;
    provenance: string | null;
    createdAt: string;
    score: number;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, project, summary, provenance, created_at FROM episodes
         ${project ? "WHERE project = ?" : ""} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...(project ? [project] : []), limit * 5) as Array<{
      id: number;
      project: string;
      summary: string;
      provenance: string | null;
      created_at: string;
    }>;
    if (!query) {
      return rows.map((r) => ({
        id: r.id,
        project: r.project,
        summary: r.summary,
        provenance: r.provenance,
        createdAt: r.created_at,
        score: 0,
      }));
    }
    const qTokens = tokenize(query);
    if (qTokens.length === 0) return [];
    return rows
      .map((r) => {
        const mTokens = tokenize(r.summary);
        const hits = qTokens.filter((t) => mTokens.includes(t)).length;
        const ratio = hits / qTokens.length;
        return ratio >= minLexical()
          ? {
              id: r.id,
              project: r.project,
              summary: r.summary,
              provenance: r.provenance,
              createdAt: r.created_at,
              score: ratio,
            }
          : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .slice(0, limit);
  }

  /** Dump complet en JSON lisible (faits actifs + archivés, historique, arêtes, épisodes). */
  exportJSON(project: string | null = null): BackupPayload {
    const memWhere = project ? "WHERE project = ?" : "";
    const memories = (
      this.db.prepare(`SELECT * FROM memories ${memWhere}`).all(...(project ? [project] : [])) as Array<Record<string, unknown>>
    ).map((m) => ({ ...m, tags: JSON.parse(m.tags as string) }));
    const history = this.db
      .prepare(
        `SELECT id, memory_id, previous, changed_at, previous_trust, previous_evidence,
                previous_valid_from, previous_valid_until, recorded_at
         FROM memory_history`,
      )
      .all() as Array<Record<string, unknown>>;
    const edges = this.db
      .prepare(`SELECT id, source_id, target_id, relation FROM edges`)
      .all() as Array<Record<string, unknown>>;
    const episodes = this.db
      .prepare(`SELECT id, project, summary, provenance, created_at FROM episodes`)
      .all() as Array<Record<string, unknown>>;
    const candidates = (
      this.db.prepare(`SELECT * FROM memory_candidates`).all() as Array<Record<string, unknown>>
    ).map((candidate) => ({ ...candidate, tags: JSON.parse(candidate.tags as string) }));
    const suppressions = this.db
      .prepare(`SELECT * FROM memory_suppressions`)
      .all() as Array<Record<string, unknown>>;
    return {
      format: "memsem-backup",
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      dbVersion: this.version(),
      project,
      memories,
      history,
      edges,
      episodes,
      candidates,
      suppressions,
    };
  }

  /**
   * Import d'un dump memsem-backup. Fusion sans casse : un fait déjà présent
   * (sujet+prédicat+objet+projet) n'est pas dupliqué ; historique/arêtes
   * rattachés aux faits existants par triplet ; épisodes dédupliqués.
   */
  importJSON(payload: BackupPayload): { memories: number; history: number; edges: number; episodes: number; candidates: number; suppressions: number } {
    if (!payload || payload.format !== "memsem-backup") {
      throw new Error("format invalide : attendu memsem-backup");
    }
    const out = { memories: 0, history: 0, edges: 0, episodes: 0, candidates: 0, suppressions: 0 };
    const idMap = new Map<number, number>();
    this.db.exec("BEGIN");
    try {
      const findMemory = this.db.prepare(
        `SELECT id FROM memories
         WHERE lower(trim(subject)) = ? AND lower(trim(predicate)) = ? AND lower(trim(object)) = ? AND trim(project) = ?`,
      );
      const insertMemory = this.db.prepare(
        `INSERT INTO memories
           (subject, predicate, object, tags, importance, confidence, frequency, project, provenance,
            trust, evidence, recorded_at, valid_from, valid_until, archived, created_at, updated_at, pinned, theme, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const m of payload.memories) {
        const subject = String(m.subject ?? "");
        const predicate = String(m.predicate ?? "");
        const object = String(m.object ?? "");
        const project = String(m.project ?? "");
        const existing = findMemory.get(normalizeKey(subject), normalizeKey(predicate), normalizeKey(object), project.trim()) as
          | { id: number }
          | undefined;
        if (existing) {
          idMap.set(Number(m.id), existing.id);
          continue;
        }
        const info = insertMemory.run(
          subject,
          predicate,
          object,
          JSON.stringify(Array.isArray(m.tags) ? m.tags : []),
          clamp01(Number(m.importance) || 0.5),
          clamp01(Number(m.confidence) || 0.5),
          Number(m.frequency) || 1,
          project,
          m.provenance ? String(m.provenance) : null,
          normalizeTrust(m.trust ? String(m.trust) : undefined),
          m.evidence ? String(m.evidence) : null,
          String(m.recorded_at ?? m.created_at ?? new Date().toISOString()),
          m.valid_from ? String(m.valid_from) : null,
          m.valid_until ? String(m.valid_until) : null,
          Number(m.archived) === 1 ? 1 : 0,
          String(m.created_at ?? new Date().toISOString()),
          String(m.updated_at ?? new Date().toISOString()),
          Number(m.pinned) === 1 ? 1 : 0,
          m.theme ? String(m.theme) : null,
          m.embedding ? JSON.stringify(m.embedding) : null,
        );
        idMap.set(Number(m.id), Number(info.lastInsertRowid));
        out.memories++;
      }

      const historyExists = this.db.prepare(
        `SELECT id FROM memory_history WHERE memory_id = ? AND previous = ? AND changed_at = ?`,
      );
      const insertHistory = this.db.prepare(
        `INSERT INTO memory_history
           (memory_id, previous, changed_at, previous_trust, previous_evidence, previous_valid_from, previous_valid_until, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const h of payload.history) {
        const targetId = idMap.get(Number(h.memory_id));
        if (!targetId) continue;
        const previous = String(h.previous ?? "");
        const changedAt = String(h.changed_at ?? "");
        if (historyExists.get(targetId, previous, changedAt)) continue;
        insertHistory.run(
          targetId,
          previous,
          changedAt,
          h.previous_trust ? normalizeTrust(String(h.previous_trust)) : null,
          h.previous_evidence ? String(h.previous_evidence) : null,
          h.previous_valid_from ? String(h.previous_valid_from) : null,
          h.previous_valid_until ? String(h.previous_valid_until) : null,
          String(h.recorded_at ?? changedAt),
        );
        out.history++;
      }

      const insertEdge = this.db.prepare(
        `INSERT OR IGNORE INTO edges (source_id, target_id, relation) VALUES (?, ?, ?)`,
      );
      for (const e of payload.edges) {
        const sourceId = idMap.get(Number(e.source_id));
        const targetId = idMap.get(Number(e.target_id));
        if (!sourceId || !targetId) continue;
        insertEdge.run(sourceId, targetId, String(e.relation ?? "related"));
        out.edges++;
      }

      const episodeExists = this.db.prepare(
        `SELECT id FROM episodes WHERE summary = ? AND created_at = ? AND COALESCE(provenance, '') = COALESCE(?, '')`,
      );
      const insertEpisode = this.db.prepare(
        `INSERT INTO episodes (project, summary, provenance, created_at) VALUES (?, ?, ?, ?)`,
      );
      for (const ep of payload.episodes) {
        const summary = String(ep.summary ?? "");
        const createdAt = String(ep.created_at ?? "");
        const provenance = ep.provenance ? String(ep.provenance) : null;
        if (episodeExists.get(summary, createdAt, provenance)) continue;
        insertEpisode.run(String(ep.project ?? ""), summary, provenance, createdAt);
        out.episodes++;
      }

      const candidateExists = this.db.prepare(
        `SELECT id FROM memory_candidates
         WHERE lower(trim(subject)) = ? AND lower(trim(predicate)) = ? AND lower(trim(object)) = ?
           AND trim(project) = ? AND status = ?`,
      );
      const insertCandidate = this.db.prepare(
        `INSERT INTO memory_candidates
           (subject, predicate, object, tags, importance, theme, project, provenance, trust, evidence,
            valid_from, valid_until, status, rejection_reason, created_at, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const candidate of payload.candidates ?? []) {
        const subject = String(candidate.subject ?? "");
        const predicate = String(candidate.predicate ?? "");
        const object = String(candidate.object ?? "");
        const project = String(candidate.project ?? "");
        const status = String(candidate.status ?? "pending");
        if (status !== "pending" && status !== "approved" && status !== "rejected") {
          throw new Error(`status candidat invalide: ${status}`);
        }
        if (candidateExists.get(normalizeKey(subject), normalizeKey(predicate), normalizeKey(object), project.trim(), status)) continue;
        insertCandidate.run(
          subject,
          predicate,
          object,
          JSON.stringify(Array.isArray(candidate.tags) ? candidate.tags : []),
          clamp01(Number(candidate.importance) || 0.5),
          candidate.theme ? String(candidate.theme) : null,
          project,
          candidate.provenance ? String(candidate.provenance) : null,
          normalizeTrust(candidate.trust ? String(candidate.trust) : undefined),
          candidate.evidence ? String(candidate.evidence) : null,
          candidate.valid_from ? String(candidate.valid_from) : null,
          candidate.valid_until ? String(candidate.valid_until) : null,
          status,
          candidate.rejection_reason ? String(candidate.rejection_reason) : null,
          String(candidate.created_at ?? new Date().toISOString()),
          candidate.reviewed_at ? String(candidate.reviewed_at) : null,
        );
        out.candidates++;
      }

      const insertSuppression = this.db.prepare(
        `INSERT OR IGNORE INTO memory_suppressions
           (subject_key, predicate_key, object_key, project, reason, source_candidate_id, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const suppression of payload.suppressions ?? []) {
        const info = insertSuppression.run(
          String(suppression.subject_key ?? ""),
          String(suppression.predicate_key ?? ""),
          String(suppression.object_key ?? ""),
          String(suppression.project ?? ""),
          suppression.reason ? String(suppression.reason) : null,
          suppression.source_candidate_id ? Number(suppression.source_candidate_id) : null,
          String(suppression.created_at ?? new Date().toISOString()),
          suppression.expires_at ? String(suppression.expires_at) : null,
        );
        if (info.changes > 0) out.suppressions++;
      }

      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
