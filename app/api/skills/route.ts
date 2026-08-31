import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await getDb().select().from(schema.skills);
  return Response.json({
    skills: items.map((s) => ({
      ...s,
      tools: JSON.parse(s.tools || "[]"),
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name: string;
    description: string;
    instructions: string;
    tools?: string[];
    markdown?: string;
  };
  const instructions = body.markdown || body.instructions || "";
  const item = {
    id: crypto.randomUUID(),
    slug: (body.name || "skill")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    name: body.name,
    description: body.description || "",
    instructions,
    tools: JSON.stringify(body.tools || []),
    icon: "sparkles",
    builtin: false,
  };
  await getDb().insert(schema.skills).values(item);
  return Response.json({ skill: { ...item, tools: body.tools || [] } });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  await getDb().delete(schema.skills).where(eq(schema.skills.id, id));
  return Response.json({ ok: true });
}
