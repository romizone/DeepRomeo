import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { BUILTIN_SKILLS } from "../skills";

const dataDir = process.env.VERCEL
  ? path.join("/tmp", "deepromeo")
  : path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "deepromeo.db");

let sqlite: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

function migrate(raw: Database.Database) {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New chat',
      mode TEXT NOT NULL DEFAULT 'chat',
      model TEXT NOT NULL DEFAULT 'flash',
      skill_id TEXT,
      project_id TEXT,
      temporary INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      canvas TEXT,
      plan TEXT,
      deliverable TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memory (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      instructions TEXT NOT NULL,
      tools TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'sparkles',
      builtin INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      manifest TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'stdio',
      command TEXT,
      args TEXT,
      url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  `);
}

function seed(raw: Database.Database) {
  const insert = raw.prepare(
    `INSERT INTO skills (id, slug, name, description, instructions, tools, icon, builtin)
     VALUES (@id, @slug, @name, @description, @instructions, @tools, @icon, 1)`,
  );
  const update = raw.prepare(
    `UPDATE skills SET slug = @slug, name = @name, description = @description, instructions = @instructions, tools = @tools, icon = @icon
     WHERE id = @id AND builtin = 1`,
  );
  const tx = raw.transaction(() => {
    for (const skill of BUILTIN_SKILLS) {
      const row = {
        ...skill,
        tools: JSON.stringify(skill.tools),
      };
      const exists = raw.prepare("SELECT id FROM skills WHERE id = ?").get(skill.id);
      if (exists) update.run(row);
      else insert.run(row);
    }
  });
  tx();

  const mem = raw.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number };
  if (mem.c === 0) {
    raw
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run(
        "app",
        JSON.stringify({
          theme: "system",
          memoryEnabled: true,
          spokenLanguage: "Auto",
        }),
      );
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;
  fs.mkdirSync(dataDir, { recursive: true });
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  migrate(sqlite);
  seed(sqlite);
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

export function getSqlite() {
  getDb();
  return sqlite as Database.Database;
}

export { schema };
