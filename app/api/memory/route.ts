import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { badRequest, readJsonObject, readString } from "@/lib/api-input";

export async function GET() {
  const items = await getDb().select().from(schema.memory);
  return Response.json({ memory: items });
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const content = readString(body, "content");
  if (!content) return badRequest("Field 'content' wajib diisi.");
  const item = { id: crypto.randomUUID(), content, createdAt: Date.now() };
  await getDb().insert(schema.memory).values(item);
  return Response.json({ item });
}

export async function DELETE(req: Request) {
  const body = await readJsonObject(req);
  const id = body && readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  await getDb().delete(schema.memory).where(eq(schema.memory.id, id));
  return Response.json({ ok: true });
}
