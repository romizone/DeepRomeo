import { listConversations, upsertConversation } from "@/lib/store";
import { badRequest, readJsonObject } from "@/lib/api-input";
import type { Conversation } from "@/lib/types";

export async function GET() {
  try {
    const items = await listConversations();
    return Response.json({
      conversations: items.map((c) => ({
        id: c.id,
        title: c.title,
        mode: c.mode,
        model: c.model,
        pinned: c.pinned,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      })),
    });
  } catch {
    return Response.json({ conversations: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const partial = body as Partial<Conversation>;
  const now = Date.now();
  const conv: Conversation = {
    id: typeof partial.id === "string" && partial.id ? partial.id : crypto.randomUUID(),
    title: typeof partial.title === "string" && partial.title ? partial.title : "New chat",
    mode: partial.mode === "work" ? "work" : "chat",
    model: partial.model === "pro" || partial.model === "vision" ? partial.model : "flash",
    skillId: partial.skillId,
    projectId: partial.projectId,
    temporary: Boolean(partial.temporary),
    pinned: Boolean(partial.pinned),
    messages: Array.isArray(partial.messages) ? partial.messages : [],
    canvas: partial.canvas ?? null,
    plan: partial.plan ?? null,
    deliverable: partial.deliverable ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await upsertConversation(conv);
  return Response.json({ conversation: conv });
}
