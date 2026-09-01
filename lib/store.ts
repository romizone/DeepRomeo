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

export async function upsertConversation(conv: Conversation) {
  if (conv.temporary) return;
  conv = persistableConversation(conv);
  const db = getDb();
  const existing = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.id, conv.id));
  const values = {
    id: conv.id,
    title: conv.title,
    mode: conv.mode,
    model: conv.model,
    skillId: conv.skillId ?? null,
    projectId: conv.projectId ?? null,
    temporary: false,
    pinned: Boolean(conv.pinned),
    archived: Boolean(conv.archived),
    canvas: conv.canvas ? JSON.stringify(conv.canvas) : null,
    plan: conv.plan ? JSON.stringify(conv.plan) : null,
    deliverable: conv.deliverable ? JSON.stringify(conv.deliverable) : null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
  if (existing[0]) {
    await db.update(schema.conversations).set(values).where(eq(schema.conversations.id, conv.id));
  } else {
    await db.insert(schema.conversations).values(values);
  }

  await db.delete(schema.messages).where(eq(schema.messages.conversationId, conv.id));
  if (conv.messages.length) {
    await db.insert(schema.messages).values(
      conv.messages.map((m) => ({
        id: m.id,
        conversationId: conv.id,
        role: m.role,
        payload: JSON.stringify(m),
        createdAt: m.createdAt,
      })),
    );
  }
}

export async function deleteConversation(id: string) {
  const db = getDb();
  await db.delete(schema.messages).where(eq(schema.messages.conversationId, id));
  await db.delete(schema.conversations).where(eq(schema.conversations.id, id));
}
