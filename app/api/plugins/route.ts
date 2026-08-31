import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await getDb().select().from(schema.plugins);
  return Response.json({
    plugins: items.map((p) => ({ ...p, manifest: JSON.parse(p.manifest) })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name: string;
    description?: string;
    manifest: unknown;
  };
  const item = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description || "",
    enabled: true,
    manifest: JSON.stringify(body.manifest),
  };
  await getDb().insert(schema.plugins).values(item);
  return Response.json({ plugin: item });
}

export async function PATCH(req: Request) {
  const { id, enabled } = (await req.json()) as { id: string; enabled: boolean };
  await getDb().update(schema.plugins).set({ enabled }).where(eq(schema.plugins.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  await getDb().delete(schema.plugins).where(eq(schema.plugins.id, id));
  return Response.json({ ok: true });
}
