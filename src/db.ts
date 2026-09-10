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
  `);

  migrateSourceCheck(db);

  return db;
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
