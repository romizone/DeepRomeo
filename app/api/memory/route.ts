import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await getDb().select().from(schema.memory);
  return Response.json({ memory: items });
}

export async function POST(req: Request) {
  const { content } = (await req.json()) as { content: string };
  const item = { id: crypto.randomUUID(), content, createdAt: Date.now() };
  await getDb().insert(schema.memory).values(item);
  return Response.json({ item });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  await getDb().delete(schema.memory).where(eq(schema.memory.id, id));
  return Response.json({ ok: true });
}
