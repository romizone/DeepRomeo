import { listConversations, upsertConversation } from "@/lib/store";
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
  const body = (await req.json()) as Partial<Conversation>;
  const now = Date.now();
  const conv: Conversation = {
    id: body.id || crypto.randomUUID(),
    title: body.title || "New chat",
    mode: body.mode || "chat",
    model: body.model || "flash",
    skillId: body.skillId,
    projectId: body.projectId,
    temporary: Boolean(body.temporary),
    pinned: Boolean(body.pinned),
    messages: body.messages || [],
    canvas: body.canvas ?? null,
    plan: body.plan ?? null,
    deliverable: body.deliverable ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await upsertConversation(conv);
  return Response.json({ conversation: conv });
}
