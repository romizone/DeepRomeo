import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { badRequest, readBoolean, readJsonObject, readOptionalString, readString } from "@/lib/api-input";

export async function GET() {
  const items = await getDb().select().from(schema.mcpServers);
  return Response.json({ servers: items });
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const name = readString(body, "name");
  if (!name) return badRequest("Field 'name' wajib diisi.");

  const transportRaw = readOptionalString(body, "transport") || "stdio";
  if (transportRaw !== "stdio" && transportRaw !== "sse") {
    return badRequest("Field 'transport' harus 'stdio' atau 'sse'.");
  }
  const command = readString(body, "command");
  // Only stdio is actually dialled; an sse row would sit there doing nothing.
  if (transportRaw === "stdio" && !command) {
    return badRequest("Connector stdio membutuhkan 'command'.");
  }
  if (transportRaw === "sse") {
    return badRequest("Transport 'sse' belum didukung. Gunakan 'stdio'.");
  }

  const item = {
    id: crypto.randomUUID(),
    name,
    transport: transportRaw,
    command,
    args: readOptionalString(body, "args") || null,
    url: readOptionalString(body, "url") || null,
    enabled: true,
  };
  await getDb().insert(schema.mcpServers).values(item);
  return Response.json({ server: item });
}

export async function PATCH(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const id = readString(body, "id");
  const enabled = readBoolean(body, "enabled");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  if (enabled === null) return badRequest("Field 'enabled' harus true atau false.");
  await getDb().update(schema.mcpServers).set({ enabled }).where(eq(schema.mcpServers.id, id));
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const body = await readJsonObject(req);
  const id = body && readString(body, "id");
  if (!id) return badRequest("Field 'id' wajib diisi.");
  await getDb().delete(schema.mcpServers).where(eq(schema.mcpServers.id, id));
  return Response.json({ ok: true });
}
