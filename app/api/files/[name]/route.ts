import fs from "node:fs";
import path from "node:path";
import { uploadCandidates } from "@/lib/storage-paths";

export const runtime = "nodejs";

/**
 * Anything that a browser will execute on this origin must never render here.
 * Uploads land in the same directory these are served from, so serving an
 * uploaded .html or .svg inline is stored XSS: it would run against the app's
 * own origin, where chat history sits in localStorage and every API route
 * answers same-origin requests.
 */
const INLINE_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function disposition(name: string): { type: string; inline: boolean } {
  const ext = path.extname(name).toLowerCase();
  const inline = INLINE_TYPES[ext];
  if (inline) return { type: inline, inline: true };
  return { type: "application/octet-stream", inline: false };
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
  const { type, inline } = disposition(safe);
  return new Response(buf, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safe.replace(/["\\]/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
