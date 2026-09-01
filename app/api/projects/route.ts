import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { badRequest, readJsonObject, readOptionalString, readString } from "@/lib/api-input";

export async function GET() {
  try {
    const items = await getDb().select().from(schema.projects);
    return Response.json({ projects: items });
  } catch {
    return Response.json({ projects: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const name = readString(body, "name");
  if (!name) return badRequest("Field 'name' wajib diisi.");
  const item = {
    id: crypto.randomUUID(),
    name,
    instructions: readOptionalString(body, "instructions") || "",
    createdAt: Date.now(),
  };
  await getDb().insert(schema.projects).values(item);
  return Response.json({ project: item });
}

export async function PATCH(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const id = readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  const name = readString(body, "name");
  const instructions = readOptionalString(body, "instructions");
  if (name === null && instructions === undefined) {
    return badRequest("Tidak ada yang diubah: sertakan 'name' atau 'instructions'.");
  }
  await getDb()
    .update(schema.projects)
    .set({
      ...(name ? { name } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
    })
    .where(eq(schema.projects.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await readJsonObject(req);
  const id = body && readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  await getDb().delete(schema.projects).where(eq(schema.projects.id, id));
  return Response.json({ ok: true });
}
