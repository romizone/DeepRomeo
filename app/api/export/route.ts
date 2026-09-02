import { normalizeSheet, normalizeSlides } from "@/lib/canvas-data";
import { badRequest, readJsonObject, readOptionalString, readString } from "@/lib/api-input";
import { maskError } from "@/lib/brand";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generous, but a bound: this endpoint is open and builds files in memory. */
const MAX_CONTENT_CHARS = 2_000_000;
const MAX_ROWS = 50_000;
const MAX_SLIDES = 500;

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;

function attachment(name: string): string {
  // RFC 5987 for non-ASCII titles; the plain fallback keeps old clients happy.
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Exports the *current* canvas — whatever is in the panel right now, edits
 * included — as a native Office file. Nothing is stored; the bytes stream
 * straight back, so ephemeral hosting is not a concern here.
 *
 * The generators are imported lazily, per format: a package that fails to
 * load in some environment then breaks only its own format, and the failure
 * surfaces as a message instead of a bare 500 with nothing to go on.
 */
export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");
  const kind = readString(body, "kind");
  const title = readOptionalString(body, "title")?.trim() || "Untitled";

  try {
    const office = await import("@/lib/office");
    let bytes: Buffer;
    let ext: keyof typeof MIME;

    if (kind === "document") {
      const content = readOptionalString(body, "content") ?? "";
      if (content.length > MAX_CONTENT_CHARS) return badRequest("Dokumen terlalu besar untuk diekspor.");
      ext = "docx";
      bytes = await office.markdownToDocx(title, content);
    } else if (kind === "spreadsheet") {
      const raw = body.sheet as { headers?: unknown; rows?: unknown } | undefined;
      const sheet = normalizeSheet(raw?.headers, raw?.rows);
      if (sheet.rows.length > MAX_ROWS) return badRequest(`Maksimal ${MAX_ROWS} baris.`);
      ext = "xlsx";
      bytes = await office.sheetToXlsx(title, sheet);
    } else if (kind === "presentation") {
      const slides = normalizeSlides(body.slides, { emptyOk: true });
      if (slides.length > MAX_SLIDES) return badRequest(`Maksimal ${MAX_SLIDES} slide.`);
      ext = "pptx";
      bytes = await office.slidesToPptx(title, slides);
    } else {
      return badRequest("Field 'kind' harus document, spreadsheet, atau presentation.");
    }

    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": MIME[ext],
        "Content-Disposition": attachment(office.safeFileName(title, ext)),
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Keep the full stack in the server log; hand the client the reason.
    console.error("[export]", kind, error);
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: `Ekspor ${kind ?? ""} gagal: ${maskError(detail)}`.replace(/\s+/g, " ").trim() },
      { status: 500 },
    );
  }
}
