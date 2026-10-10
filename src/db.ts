import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

export type ReminderStatus = "pending" | "sent" | "cancelled" | "failed";
export type ReminderSource = "telegram" | "web" | "whatsapp";

export interface Reminder {
  id: number;
  text: string;
  due_at: string;
  status: ReminderStatus;
  created_at: string;
  source: ReminderSource;
  error: string | null;
}

export interface VisaDocument {
  id: number;
  title: string;
  start_date: string | null;
  due_date: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
}

interface VisaDocumentRow {
  id: number;
  title: string;
  start_date: string | null;
  due_date: string | null;
  done: number;
  created_at: string;
  updated_at: string;
}

function mapVisaDocument(row: VisaDocumentRow): VisaDocument {
  return {
    id: row.id,
    title: row.title,
    start_date: row.start_date ?? null,
    due_date: row.due_date,
    done: row.done === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

let db: Database.Database;

function migrateSourceCheck(database: Database.Database): void {
  const row = database
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reminders'`
    )
    .get() as { sql: string } | undefined;

  if (!row?.sql) return;
  if (row.sql.includes("'telegram'")) return;

  database.exec(`
    BEGIN;
    CREATE TABLE reminders_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled', 'failed')),
      created_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('telegram', 'web', 'whatsapp')),
      error TEXT
    );
    INSERT INTO reminders_new (id, text, due_at, status, created_at, source, error)
      SELECT id, text, due_at, status, created_at, source, error FROM reminders;
    DROP TABLE reminders;
    ALTER TABLE reminders_new RENAME TO reminders;
    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders(status, due_at);
    COMMIT;
  `);
}

export function initDb(): Database.Database {
  const dbPath = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'cancelled', 'failed')),
      created_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('telegram', 'web', 'whatsapp')),
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_due
      ON reminders(status, due_at);

    CREATE TABLE IF NOT EXISTS visa_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      start_date TEXT,
      due_date TEXT,
      done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_visa_documents_done_due
      ON visa_documents(done, due_date);

    CREATE TABLE IF NOT EXISTS visa_digest_log (
      digest_key TEXT PRIMARY KEY
    );
  `);

  migrateSourceCheck(db);
  migrateVisaStartDate(db);

  return db;
}

function migrateVisaStartDate(database: Database.Database): void {
  const cols = database
    .prepare(`PRAGMA table_info(visa_documents)`)
    .all() as { name: string }[];
  if (cols.some((c) => c.name === "start_date")) return;
  database.exec(`ALTER TABLE visa_documents ADD COLUMN start_date TEXT`);
}

function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function createReminder(input: {
  text: string;
  dueAt: Date;
  source: ReminderSource;
}): Reminder {
  const now = new Date().toISOString();
  const dueAt = input.dueAt.toISOString();
  const result = getDb()
    .prepare(
      `INSERT INTO reminders (text, due_at, status, created_at, source, error)
       VALUES (?, ?, 'pending', ?, ?, NULL)`
    )
    .run(input.text.trim(), dueAt, now, input.source);

  return getReminderById(Number(result.lastInsertRowid))!;
}

export function getReminderById(id: number): Reminder | undefined {
  return getDb()
    .prepare(`SELECT * FROM reminders WHERE id = ?`)
    .get(id) as Reminder | undefined;
}

export function listReminders(options?: {
  status?: ReminderStatus | ReminderStatus[];
  limit?: number;
}): Reminder[] {
  const limit = options?.limit ?? 50;
  const statuses = options?.status
    ? Array.isArray(options.status)
      ? options.status
      : [options.status]
    : undefined;

  if (statuses?.length) {
    const placeholders = statuses.map(() => "?").join(", ");
    return getDb()
      .prepare(
        `SELECT * FROM reminders
         WHERE status IN (${placeholders})
         ORDER BY due_at ASC
         LIMIT ?`
      )
      .all(...statuses, limit) as Reminder[];
  }

  return getDb()
    .prepare(
      `SELECT * FROM reminders
       ORDER BY due_at DESC
       LIMIT ?`
    )
    .all(limit) as Reminder[];
}

export function listUpcoming(limit = 20): Reminder[] {
  return listReminders({ status: "pending", limit });
}

export function cancelReminder(id: number): Reminder | undefined {
  const existing = getReminderById(id);
  if (!existing || existing.status !== "pending") {
    return undefined;
  }

  getDb()
    .prepare(`UPDATE reminders SET status = 'cancelled' WHERE id = ?`)
    .run(id);

  return getReminderById(id);
}

export function getDueReminders(now = new Date()): Reminder[] {
  return getDb()
    .prepare(
      `SELECT * FROM reminders
       WHERE status = 'pending' AND due_at <= ?
       ORDER BY due_at ASC`
    )
    .all(now.toISOString()) as Reminder[];
}

export function markReminderSent(id: number): void {
  getDb()
    .prepare(
      `UPDATE reminders SET status = 'sent', error = NULL WHERE id = ?`
    )
    .run(id);
}

export function markReminderFailed(id: number, error: string): void {
  getDb()
    .prepare(
      `UPDATE reminders SET status = 'failed', error = ? WHERE id = ?`
    )
    .run(error.slice(0, 500), id);
}

export function getVisaDocumentById(id: number): VisaDocument | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM visa_documents WHERE id = ?`)
    .get(id) as VisaDocumentRow | undefined;
  return row ? mapVisaDocument(row) : undefined;
}

export function listVisaDocuments(): VisaDocument[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM visa_documents
       ORDER BY done ASC,
         CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,
         start_date ASC,
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         id ASC`
    )
    .all() as VisaDocumentRow[];
  return rows.map(mapVisaDocument);
}

export function listUnfinishedVisaDocuments(): VisaDocument[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM visa_documents
       WHERE done = 0
       ORDER BY
         CASE WHEN start_date IS NULL THEN 1 ELSE 0 END,
         start_date ASC,
         CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
         due_date ASC,
         id ASC`
    )
    .all() as VisaDocumentRow[];
  return rows.map(mapVisaDocument);
}

export function createVisaDocument(input: {
  title: string;
  startDate?: string | null;
  dueDate?: string | null;
}): VisaDocument {
  const now = new Date().toISOString();
  const startDate = input.startDate?.trim() || null;
  const dueDate = input.dueDate?.trim() || null;
  const result = getDb()
    .prepare(
      `INSERT INTO visa_documents (title, start_date, due_date, done, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    )
    .run(input.title.trim(), startDate, dueDate, now, now);

  return getVisaDocumentById(Number(result.lastInsertRowid))!;
}

export function setVisaDocumentDone(
  id: number,
  done: boolean
): VisaDocument | undefined {
  const existing = getVisaDocumentById(id);
  if (!existing) return undefined;

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE visa_documents SET done = ?, updated_at = ? WHERE id = ?`
    )
    .run(done ? 1 : 0, now, id);

  return getVisaDocumentById(id);
}

export function updateVisaDocumentDates(
  id: number,
  input: { startDate: string | null; dueDate: string | null }
): VisaDocument | undefined {
  const existing = getVisaDocumentById(id);
  if (!existing) return undefined;

  const startDate = input.startDate?.trim() || null;
  const dueDate = input.dueDate?.trim() || null;

  if (startDate && dueDate && startDate > dueDate) {
    throw new Error("start_date must be on or before due_date");
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE visa_documents
       SET start_date = ?, due_date = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(startDate, dueDate, now, id);

  return getVisaDocumentById(id);
}

export function deleteVisaDocument(id: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM visa_documents WHERE id = ?`)
    .run(id);
  return result.changes > 0;
}

export function wasVisaDigestSent(digestKey: string): boolean {
  const row = getDb()
    .prepare(`SELECT 1 AS ok FROM visa_digest_log WHERE digest_key = ?`)
    .get(digestKey) as { ok: number } | undefined;
  return Boolean(row);
}

export function markVisaDigestSent(digestKey: string): void {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO visa_digest_log (digest_key) VALUES (?)`
    )
    .run(digestKey);
}
