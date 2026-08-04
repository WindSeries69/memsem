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
  createdAt: string;
  updatedAt: string;
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
  pin?: boolean;
}

export interface AddResult {
  id: number;
  created: boolean;
  changed: boolean;
  conflict: boolean;
  confidence: number;
  frequency: number;
  faded: number[];
  archived: number[];
  history: Array<{ previous: string; changedAt: string }>;
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
  priority: number;
  score: number;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim();
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

  add(input: AddInput): AddResult {
    const now = new Date().toISOString();
    const subject = input.subject.trim();
    const predicate = input.predicate.trim();
    const object = input.object.trim();
    const importance = clamp01(input.importance ?? 0.5);
    const theme = input.theme?.trim().toLowerCase() || null;
    const tags = [...new Set((input.tags ?? []).map((t) => t.trim()).filter(Boolean))];

    const rows = this.db
      .prepare(
        `SELECT id, object, confidence, frequency, importance, tags
         FROM memories WHERE subject = ? AND predicate = ? AND project = ? AND archived = 0`,
      )
      .all(normalizeKey(subject), normalizeKey(predicate), input.project) as Array<{
      id: number;
      object: string;
      confidence: number;
      frequency: number;
      importance: number;
      tags: string;
    }>;

    const exact = rows.find((r) => normalizeKey(r.object) === normalizeKey(object));

    if (exact) {
      const faded: number[] = [];
      const archived: number[] = [];
      for (const other of rows) {
        if (other.id === exact.id) continue;
        const outcome = this.fade(other, now);
        if (outcome.archived) archived.push(outcome.id);
        else faded.push(outcome.id);
      }
      const cfg = getConfig();
      const confidence = clamp01(exact.confidence + cfg.reinforceConfidenceStep);
      const mergedTags = [...new Set([...JSON.parse(exact.tags), ...tags])];
      this.db
        .prepare(
          `UPDATE memories
           SET confidence = ?, frequency = frequency + 1,
               importance = MAX(importance, ?), tags = ?, updated_at = ?,
               pinned = MAX(pinned, ?), theme = COALESCE(theme, ?)
           WHERE id = ?`,
        )
        .run(confidence, importance, JSON.stringify(mergedTags), now, input.pin ? 1 : 0, theme, exact.id);
      const history = this.historyOf(exact.id);
      return {
        id: exact.id,
        created: false,
        changed: false,
        conflict: faded.length + archived.length > 0,
        confidence,
        frequency: exact.frequency + 1,
        faded,
        archived,
        history,
      };
    }

    if (rows.length > 0) {
      const faded: number[] = [];
      const archived: number[] = [];
      for (const other of rows) {
        const outcome = this.fade(other, now);
        if (outcome.archived) archived.push(outcome.id);
        else faded.push(outcome.id);
      }
      const info = this.db
        .prepare(
          `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance, created_at, updated_at, pinned, theme)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(subject, predicate, object, JSON.stringify(tags), importance, getConfig().supersedeConfidence, input.project, input.provenance ?? null, now, now, input.pin ? 1 : 0, theme);
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
        confidence: 0.6,
        frequency: 1,
        faded,
        archived,
        history: [],
      };
    }

    const info = this.db
      .prepare(
        `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance, created_at, updated_at, pinned, theme)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      )
      .run(subject, predicate, object, JSON.stringify(tags), importance, getConfig().initialConfidence, input.project, input.provenance ?? null, now, now, input.pin ? 1 : 0, theme);
    const id = Number(info.lastInsertRowid);
    this.linkMemory(id, subject, object, input.project);
    return {
      id,
      created: true,
      changed: false,
      conflict: false,
      confidence: 0.5,
      frequency: 1,
      faded: [],
      archived: [],
      history: [],
    };
  }

  private linkMemory(id: number, subject: string, object: string, project: string): void {
    const others = this.db
      .prepare(
        `SELECT id, subject, object FROM memories
         WHERE project = ? AND archived = 0 AND id != ?`,
      )
      .all(project, id) as Array<{ id: number; subject: string; object: string }>;
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

  private fade(row: { id: number; object: string; confidence: number; importance: number }, now: string): { id: number; archived: boolean } {
    const cfg = getConfig();
    const factor = row.importance >= cfg.criticalImportance ? cfg.criticalFadeFactor : cfg.fadeFactor;
    const next = row.confidence * factor;
    if (next < cfg.archiveThreshold) {
      this.db
        .prepare(`UPDATE memories SET archived = 1, updated_at = ? WHERE id = ?`)
        .run(now, row.id);
      this.db
        .prepare(`INSERT INTO memory_history (memory_id, previous, changed_at) VALUES (?, ?, ?)`)
        .run(row.id, row.object, now);
      return { id: row.id, archived: true };
    }
    this.db.prepare(`UPDATE memories SET confidence = ? WHERE id = ?`).run(next, row.id);
    return { id: row.id, archived: false };
  }

  private historyOf(memoryId: number): Array<{ previous: string; changedAt: string }> {
    return (
      this.db
        .prepare(`SELECT previous, changed_at FROM memory_history WHERE memory_id = ? ORDER BY changed_at DESC`)
        .all(memoryId) as Array<{ previous: string; changed_at: string }>
    ).map((h) => ({ previous: h.previous, changedAt: h.changed_at }));
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

  private whereClause(project: string | null, theme: string | null): { sql: string; params: (string | number)[] } {
    const clauses: string[] = ["archived = 0"];
    const params: (string | number)[] = [];
    if (theme) {
      clauses.push("(theme = ? OR theme LIKE ?)");
      params.push(theme, `${theme}/%`);
    } else if (project) {
      clauses.push("project = ?");
      params.push(project);
    }
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

  async search(query: string, project: string | null, theme: string | null, limit: number, relax: boolean = false, focus: string[] | null = null): Promise<SearchHit[]> {
    const where = this.whereClause(project, theme);
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project, pinned, theme, updated_at
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
      pinned: number;
      theme: string | null;
      updated_at: string;
    }>;
    const hits: SearchHit[] = [];
    for (const row of rows) {
      const tags = JSON.parse(row.tags) as string[];
      hits.push({ ...row, pinned: row.pinned === 1, tags, priority: this.priorityOf(row), score: 0 });
    }
    const withBase = hits.map((h) => ({ ...h, score: searchScore(query, h), lexical: lexicalScore(query, h) }));
    const seeded = withBase
      .filter((h) => h.lexical > 0 && (relax || h.lexical >= minLexical()))
      .sort((a, b) => b.score - a.score);
    if (!relax) return this.reweight(seeded, focus).sort((a, b) => b.score - a.score).slice(0, limit);
    if (seeded.length === 0) {
      return (await this.semanticCandidates(query, project, theme, limit)).slice(0, limit);
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
      const next: Array<typeof withBase[number]> = [];
      for (const h of withBase) {
        if (neighbors.has(h.id) && !activated.has(h.id)) {
          h.score = best * Math.pow(cfg.relaxGraphBoost, hop);
          activated.add(h.id);
          next.push(h);
        }
      }
      frontier = next;
    }
    const base = withBase
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score);
    if (base.length === 0) {
      return this.reweight(await this.semanticCandidates(query, project, theme, limit), focus).slice(0, limit);
    }
    const semantic = await this.semanticCandidates(query, project, theme, limit);
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
  ): Promise<SearchHit[]> {
    if (!(await ollamaAvailable())) return [];
    const qv = await embed(query);
    if (!qv) return [];
    const where = this.whereClause(project, theme);
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project, pinned, theme, embedding, updated_at
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
        pinned: row.pinned === 1,
        theme: row.theme,
        project: row.project,
        priority: this.priorityOf(row),
        score: sim * getConfig().relaxSemanticWeight,
      }));
  }

  list(project: string | null, theme: string | null, limit: number, focus: string[] | null = null): SearchHit[] {
    const where = this.whereClause(project, theme);
    const rows = this.db
      .prepare(
        `SELECT id, subject, predicate, object, tags, importance, confidence, frequency, project, pinned, theme, updated_at
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

  forget(id: number): boolean {
    const info = this.db.prepare(`UPDATE memories SET archived = 1 WHERE id = ? AND archived = 0`).run(id);
    return info.changes > 0;
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
      .prepare(`SELECT id, memory_id, previous, changed_at FROM memory_history`)
      .all() as Array<Record<string, unknown>>;
    const edges = this.db
      .prepare(`SELECT id, source_id, target_id, relation FROM edges`)
      .all() as Array<Record<string, unknown>>;
    const episodes = this.db
      .prepare(`SELECT id, project, summary, provenance, created_at FROM episodes`)
      .all() as Array<Record<string, unknown>>;
    return {
      format: "memsem-backup",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      dbVersion: this.version(),
      project,
      memories,
      history,
      edges,
      episodes,
    };
  }

  /**
   * Import d'un dump memsem-backup. Fusion sans casse : un fait déjà présent
   * (sujet+prédicat+objet+projet) n'est pas dupliqué ; historique/arêtes
   * rattachés aux faits existants par triplet ; épisodes dédupliqués.
   */
  importJSON(payload: BackupPayload): { memories: number; history: number; edges: number; episodes: number } {
    if (!payload || payload.format !== "memsem-backup") {
      throw new Error("format invalide : attendu memsem-backup");
    }
    const out = { memories: 0, history: 0, edges: 0, episodes: 0 };
    const idMap = new Map<number, number>();
    this.db.exec("BEGIN");
    try {
      const findMemory = this.db.prepare(
        `SELECT id FROM memories
         WHERE lower(trim(subject)) = ? AND lower(trim(predicate)) = ? AND lower(trim(object)) = ? AND trim(project) = ?`,
      );
      const insertMemory = this.db.prepare(
        `INSERT INTO memories (subject, predicate, object, tags, importance, confidence, frequency, project, provenance, archived, created_at, updated_at, pinned, theme, embedding)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        `INSERT INTO memory_history (memory_id, previous, changed_at) VALUES (?, ?, ?)`,
      );
      for (const h of payload.history) {
        const targetId = idMap.get(Number(h.memory_id));
        if (!targetId) continue;
        const previous = String(h.previous ?? "");
        const changedAt = String(h.changed_at ?? "");
        if (historyExists.get(targetId, previous, changedAt)) continue;
        insertHistory.run(targetId, previous, changedAt);
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

      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }
}
