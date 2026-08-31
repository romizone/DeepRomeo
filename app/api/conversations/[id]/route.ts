import { deleteConversation, getConversation, upsertConversation } from "@/lib/store";
import type { Conversation } from "@/lib/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ conversation: conv });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as Partial<Conversation>;
  const next = { ...conv, ...body, id, updatedAt: Date.now() };
  await upsertConversation(next);
  return Response.json({ conversation: next });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  await deleteConversation(id);
  return Response.json({ ok: true });
}
