import type { Attachment } from "./types";

/** Vercel serverless request body is ~4.5MB; leave room for multipart headers. */
export const VERCEL_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const LOCAL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
/** Keep compressed image data URLs in chat JSON (under the 4.5MB platform cap). */
export const IMAGE_DATA_URL_MAX_CHARS = 480_000;
export const EXTRACT_CHARS_PER_FILE = 12_000;
export const EXTRACT_CHARS_TOTAL = 36_000;
export const UPLOAD_TIMEOUT_MS = 45_000;
export const CHAT_STALL_MS = 90_000;
export const PROVIDER_FETCH_TIMEOUT_MS = 180_000;
export const TRUNCATION_MARK = "[truncated]";
export const EMPTY_ANALYSIS_MESSAGE =
  "Tidak ada hasil. File mungkin terlalu besar atau analisis terhenti. Coba kirim ulang dengan lebih sedikit halaman.";

const ECHO_TOOLS = new Set(["verify_pdf", "read_pdf"]);

export function isLocalHost(hostname?: string | null) {
  if (!hostname) return false;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function clientUploadMaxBytes(hostname?: string | null) {
  return isLocalHost(hostname) ? LOCAL_UPLOAD_MAX_BYTES : VERCEL_UPLOAD_MAX_BYTES;
}

export function serverUploadMaxBytes() {
  return process.env.VERCEL ? VERCEL_UPLOAD_MAX_BYTES : LOCAL_UPLOAD_MAX_BYTES;
}

export function bytesToMaxMb(bytes: number) {
  return Math.max(1, Math.floor(bytes / (1024 * 1024)));
}

export function tooLargeError(name: string, maxBytes: number) {
  const mb = bytesToMaxMb(maxBytes);
  if (/\.pdf$/i.test(name) || /pdf/i.test(name)) {
    return `PDF terlalu besar (maks. ${mb} MB)`;
  }
  return `File terlalu besar (maks. ${mb} MB)`;
}

export function truncateExtractedText(text: string, limit = EXTRACT_CHARS_PER_FILE): string {
  const raw = text ?? "";
  if (raw.length <= limit) return raw;
  const mark = `\n\n${TRUNCATION_MARK}`;
  const bodyLimit = Math.max(0, limit - mark.length);
  return `${raw.slice(0, bodyLimit).trimEnd()}${mark}`;
}

export function sanitizeAttachment(attachment: Attachment, perFileLimit = EXTRACT_CHARS_PER_FILE): Attachment {
  const isFile = attachment.kind === "file";
  const rawUrl = attachment.url || "";
  let url = rawUrl;
  if (rawUrl.startsWith("data:")) {
    if (isFile || rawUrl.length > IMAGE_DATA_URL_MAX_CHARS) url = "";
  }
  return {
    id: attachment.id,
    name: attachment.name,
    mime: attachment.mime,
    size: attachment.size,
    url,
    kind: attachment.kind,
    text: isFile ? truncateExtractedText(attachment.text || "", perFileLimit) : attachment.text,
  };
}

export function sanitizeAttachments(attachments: Attachment[] | undefined): Attachment[] {
  if (!attachments?.length) return [];
  const out: Attachment[] = [];
  let used = 0;
  for (const raw of attachments) {
    const next = sanitizeAttachment(raw);
    if (next.kind === "file" && next.text) {
      const remaining = EXTRACT_CHARS_TOTAL - used;
      if (remaining <= 80) {
        out.push({
          ...next,
          text: `[${next.name} omitted — attachment text budget exceeded]\n\n${TRUNCATION_MARK}`,
        });
        continue;
      }
      if (next.text.length > remaining) {
        next.text = truncateExtractedText(next.text.replace(/\n\n\[truncated\]$/i, ""), remaining);
      }
      used += next.text.length;
    }
    out.push(next);
  }
  return out;
}

export function attachmentsForChatRequest(attachments: Attachment[] | undefined): Attachment[] {
  return sanitizeAttachments(attachments);
}

export function buildFileNotes(attachments: Attachment[] | undefined): string {
  return sanitizeAttachments(attachments)
    .filter((a) => a.kind === "file" && a.text)
    .map((a) => `\n\n[File: ${a.name}]\n${a.text}`)
    .join("");
}

export function buildProviderUserText(content: string, attachments?: Attachment[]): string {
  return `${content || ""}${buildFileNotes(attachments)}`;
}

export function capToolArguments(name: string, raw: string): string {
  if (!ECHO_TOOLS.has(name) || !raw || raw.length <= 4000) return raw;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.text === "string" && obj.text.length > 2000) {
      obj.text = truncateExtractedText(obj.text, 2000);
    }
    return JSON.stringify(obj);
  } catch {
    return `${raw.slice(0, 4000)}... ${TRUNCATION_MARK}`;
  }
}
