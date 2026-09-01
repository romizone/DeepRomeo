import { desc, eq } from "drizzle-orm";
import { persistableConversation } from "./attachments";
import { hydrateCanvas } from "./canvas-data";
import { getDb, schema } from "./db";
import type { CanvasState, Conversation, Message } from "./types";

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function rowToConversation(
  row: typeof schema.conversations.$inferSelect,
  msgs: Message[] = [],
): Conversation {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode as Conversation["mode"],
    model: row.model as Conversation["model"],
    skillId: row.skillId,
    projectId: row.projectId,
    temporary: row.temporary,
    pinned: row.pinned,
    archived: row.archived,
    messages: msgs,
    canvas: (() => {
      const raw = parseJson<CanvasState | null>(row.canvas, null);
      if (!raw) return null;
      try {
        return hydrateCanvas(raw);
      } catch {
        return null;
      }
    })(),
    plan: parseJson(row.plan, null),
    deliverable: parseJson(row.deliverable, null),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listConversations() {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.archived, false))
    .orderBy(desc(schema.conversations.updatedAt));
  return rows.filter((r) => !r.temporary).map((r) => rowToConversation(r));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, id));
  const row = rows[0];
  if (!row) return null;
  const msgRows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id));
  msgRows.sort((a, b) => a.createdAt - b.createdAt);
  const messages = msgRows.map((m) => parseJson<Message>(m.payload, { id: m.id, role: "user", content: "", createdAt: m.createdAt }));
  return rowToConversation(row, messages);
}

/** SQLite caps bound parameters per statement; messages carry 5 columns each. */
const MESSAGE_INSERT_CHUNK = 200;

export async function upsertConversation(conv: Conversation) {
  if (conv.temporary) return;
  const next = persistableConversation(conv);
  const db = getDb();
  const values = {
    id: next.id,
    title: next.title,
    mode: next.mode,
    model: next.model,
    skillId: next.skillId ?? null,
    projectId: next.projectId ?? null,
    temporary: false,
    pinned: Boolean(next.pinned),
    archived: Boolean(next.archived),
    canvas: next.canvas ? JSON.stringify(next.canvas) : null,
    plan: next.plan ? JSON.stringify(next.plan) : null,
    deliverable: next.deliverable ? JSON.stringify(next.deliverable) : null,
    createdAt: next.createdAt,
    updatedAt: next.updatedAt,
  };
  const rows = next.messages.map((m) => ({
    id: m.id,
    conversationId: next.id,
    role: m.role,
    payload: JSON.stringify(m),
    createdAt: m.createdAt,
  }));

  // The rewrite deletes every message before re-inserting them. Outside a
  // transaction a failure between the two halves wipes the whole thread.
  db.transaction((tx) => {
    const existing = tx
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(eq(schema.conversations.id, next.id))
      .all();
    if (existing.length) {
      tx.update(schema.conversations).set(values).where(eq(schema.conversations.id, next.id)).run();
    } else {
      tx.insert(schema.conversations).values(values).run();
    }

    tx.delete(schema.messages).where(eq(schema.messages.conversationId, next.id)).run();
    for (let i = 0; i < rows.length; i += MESSAGE_INSERT_CHUNK) {
      tx.insert(schema.messages).values(rows.slice(i, i + MESSAGE_INSERT_CHUNK)).run();
    }
  });
}

export async function deleteConversation(id: string) {
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(schema.messages).where(eq(schema.messages.conversationId, id)).run();
    tx.delete(schema.conversations).where(eq(schema.conversations.id, id)).run();
  });
}
