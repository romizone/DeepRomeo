import fs from "node:fs";
import path from "node:path";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  const candidates = [
    path.join("/tmp", "deepromeo-uploads", safe),
    path.join(process.cwd(), "uploads", safe),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return new Response("Not found", { status: 404 });
  const buf = fs.readFileSync(file);
  return new Response(buf, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}
