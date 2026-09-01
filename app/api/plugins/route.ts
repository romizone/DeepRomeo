import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { badRequest, readBoolean, readJsonObject, readOptionalString, readString } from "@/lib/api-input";

export async function GET() {
  const items = await getDb().select().from(schema.plugins);
  return Response.json({
    plugins: items.map((p) => {
      let manifest: unknown = { functions: [] };
      try {
        manifest = JSON.parse(p.manifest);
      } catch {
        // A row written before validation could still hold unparseable JSON;
        // one bad row must not take down the whole listing.
        manifest = { functions: [] };
      }
      return { ...p, manifest };
    }),
  });
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const name = readString(body, "name");
  if (!name) return badRequest("Field 'name' wajib diisi.");
  const manifest = body.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    return badRequest("Field 'manifest' harus berupa objek JSON.");
  }
  const item = {
    id: crypto.randomUUID(),
    name,
    description: readOptionalString(body, "description") || "",
    enabled: true,
    manifest: JSON.stringify(manifest),
  };
  await getDb().insert(schema.plugins).values(item);
  return Response.json({ plugin: { ...item, manifest } });
}

export async function PATCH(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const id = readString(body, "id");
  const enabled = readBoolean(body, "enabled");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  if (enabled === null) return badRequest("Field 'enabled' harus true atau false.");
  await getDb().update(schema.plugins).set({ enabled }).where(eq(schema.plugins.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await readJsonObject(req);
  const id = body && readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  await getDb().delete(schema.plugins).where(eq(schema.plugins.id, id));
  return Response.json({ ok: true });
}
