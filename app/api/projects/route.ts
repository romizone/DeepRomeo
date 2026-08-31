import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await getDb().select().from(schema.projects);
  return Response.json({ projects: items });
}

export async function POST(req: Request) {
  const { name, instructions } = (await req.json()) as {
    name: string;
    instructions?: string;
  };
  const item = {
    id: crypto.randomUUID(),
    name,
    instructions: instructions || "",
    createdAt: Date.now(),
  };
  await getDb().insert(schema.projects).values(item);
  return Response.json({ project: item });
}

export async function PATCH(req: Request) {
  const { id, name, instructions } = (await req.json()) as {
    id: string;
    name?: string;
    instructions?: string;
  };
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
  const { id } = (await req.json()) as { id: string };
  await getDb().delete(schema.projects).where(eq(schema.projects.id, id));
  return Response.json({ ok: true });
}
