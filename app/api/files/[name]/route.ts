import fs from "node:fs";
import path from "node:path";
import { uploadCandidates } from "@/lib/storage-paths";

export const runtime = "nodejs";

function contentType(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".csv") return "text/csv; charset=utf-8";
  if (ext === ".txt" || ext === ".md") return "text/plain; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json") return "application/json";
  return "application/octet-stream";
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ name: string }> },
) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  const file = uploadCandidates(safe).find((p) => fs.existsSync(p));
  if (!file) return new Response("Not found", { status: 404 });
  const buf = fs.readFileSync(file);
  return new Response(buf, {
    headers: {
      "Content-Type": contentType(safe),
      "Content-Disposition": `inline; filename="${safe.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
