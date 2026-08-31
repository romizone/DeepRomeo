import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  const items = await getDb().select().from(schema.mcpServers);
  return Response.json({ servers: items });
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    name: string;
    transport?: "stdio" | "sse";
    command?: string;
    args?: string;
    url?: string;
  };
  const item = {
    id: crypto.randomUUID(),
    name: body.name,
    transport: body.transport || "stdio",
    command: body.command || null,
    args: body.args || null,
    url: body.url || null,
    enabled: true,
  };
  await getDb().insert(schema.mcpServers).values(item);
  return Response.json({ server: item });
}

export async function PATCH(req: Request) {
  const { id, enabled } = (await req.json()) as { id: string; enabled: boolean };
  await getDb()
    .update(schema.mcpServers)
    .set({ enabled })
    .where(eq(schema.mcpServers.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = (await req.json()) as { id: string };
  await getDb().delete(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return Response.json({ ok: true });
}
