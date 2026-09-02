import { normalizeSheet, normalizeSlides } from "@/lib/canvas-data";
import { badRequest, readJsonObject, readOptionalString, readString } from "@/lib/api-input";
import { OFFICE_MIME, markdownToDocx, safeFileName, sheetToXlsx, slidesToPptx } from "@/lib/office";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generous, but a bound: this endpoint is open and builds files in memory. */
const MAX_CONTENT_CHARS = 2_000_000;
const MAX_ROWS = 50_000;
const MAX_SLIDES = 500;

function attachment(name: string): string {
  // RFC 5987 for non-ASCII titles; the plain fallback keeps old clients happy.
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Exports the *current* canvas — whatever is in the panel right now, edits
 * included — as a native Office file. Nothing is stored; the bytes stream
 * straight back, so ephemeral hosting is not a concern here.
 */
export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const kind = readString(body, "kind");
  const title = readOptionalString(body, "title")?.trim() || "Untitled";

  let bytes: Buffer;
  let ext: keyof typeof OFFICE_MIME;

  if (kind === "document") {
    const content = readOptionalString(body, "content") ?? "";
    if (content.length > MAX_CONTENT_CHARS) return badRequest("Dokumen terlalu besar untuk diekspor.");
    ext = "docx";
    bytes = await markdownToDocx(title, content);
  } else if (kind === "spreadsheet") {
    const raw = body.sheet as { headers?: unknown; rows?: unknown } | undefined;
    const sheet = normalizeSheet(raw?.headers, raw?.rows);
    if (sheet.rows.length > MAX_ROWS) return badRequest(`Maksimal ${MAX_ROWS} baris.`);
    ext = "xlsx";
    bytes = await sheetToXlsx(title, sheet);
  } else if (kind === "presentation") {
    const slides = normalizeSlides(body.slides, { emptyOk: true });
    if (slides.length > MAX_SLIDES) return badRequest(`Maksimal ${MAX_SLIDES} slide.`);
    ext = "pptx";
    bytes = await slidesToPptx(title, slides);
  } else {
    return badRequest("Field 'kind' harus document, spreadsheet, atau presentation.");
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": OFFICE_MIME[ext],
      "Content-Disposition": attachment(safeFileName(title, ext)),
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
