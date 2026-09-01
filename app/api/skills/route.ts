import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { badRequest, readJsonObject, readOptionalString, readString } from "@/lib/api-input";

export async function GET() {
  try {
    const items = await getDb().select().from(schema.skills);
    return Response.json({
      skills: items.map((s) => {
        let tools: unknown = [];
        try {
          tools = JSON.parse(s.tools || "[]");
        } catch {
          tools = [];
        }
        return { ...s, tools };
      }),
    });
  } catch {
    return Response.json({ skills: [] }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const name = readString(body, "name");
  if (!name) return badRequest("Field 'name' wajib diisi.");
  const instructions = readOptionalString(body, "markdown") || readOptionalString(body, "instructions") || "";
  const tools = Array.isArray(body.tools) ? body.tools.filter((t) => typeof t === "string") : [];
  const item = {
    id: crypto.randomUUID(),
    slug:
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "skill",
    name,
    description: readOptionalString(body, "description") || "",
    instructions,
    tools: JSON.stringify(tools),
    icon: "sparkles",
    builtin: false,
  };
  await getDb().insert(schema.skills).values(item);
  return Response.json({ skill: { ...item, tools } });
}

export async function DELETE(req: Request) {
  const body = await readJsonObject(req);
  const id = body && readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  // Built-in skills are re-seeded on every boot, so deleting one is a no-op
  // that looks like success. Say so instead.
  const rows = await getDb().select().from(schema.skills).where(eq(schema.skills.id, id));
  if (rows[0]?.builtin) return badRequest("GPT bawaan tidak bisa dihapus.");
  await getDb().delete(schema.skills).where(eq(schema.skills.id, id));
  return Response.json({ ok: true });
}
