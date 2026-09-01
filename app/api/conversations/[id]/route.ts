import { deleteConversation, getConversation, upsertConversation } from "@/lib/store";
import { badRequest, readJsonObject } from "@/lib/api-input";
import type { Conversation } from "@/lib/types";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const conv = await getConversation(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ conversation: conv });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const conv = await getConversation(id);
  if (!conv) return Response.json({ error: "Not found" }, { status: 404 });

  // Spreading the raw body used to let a caller overwrite createdAt, messages,
  // or temporary — and a bad value would then be written straight back.
  const next: Conversation = { ...conv, id, updatedAt: Date.now() };
  if (typeof body.title === "string" && body.title.trim()) next.title = body.title.trim();
  if (typeof body.pinned === "boolean") next.pinned = body.pinned;
  if (typeof body.archived === "boolean") next.archived = body.archived;
  if (body.mode === "chat" || body.mode === "work") next.mode = body.mode;
  if (body.model === "flash" || body.model === "vision" || body.model === "pro") next.model = body.model;
  if (body.canvas === null || (body.canvas && typeof body.canvas === "object")) {
    next.canvas = body.canvas as Conversation["canvas"];
  }
  if (body.plan === null || (body.plan && typeof body.plan === "object")) {
    next.plan = body.plan as Conversation["plan"];
  }

  await upsertConversation(next);
  return Response.json({ conversation: next });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await deleteConversation(id);
  return Response.json({ ok: true });
}
