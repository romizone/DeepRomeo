/** Lightweight PDF text extraction that runs in the browser and Node (no pdf.js). */

function latin1(data: Uint8Array): string {
  const parts: string[] = [];
  const step = 8192;
  for (let i = 0; i < data.length; i += step) {
    const slice = data.subarray(i, Math.min(i + step, data.length));
    let chunk = "";
    for (let j = 0; j < slice.length; j++) chunk += String.fromCharCode(slice[j]);
    parts.push(chunk);
  }
  return parts.join("");
}

function unescapePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([()])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct: string) => String.fromCharCode(parseInt(oct, 8) || 0));
}

function stringsFromPdfSource(source: string): string {
  const chunks: string[] = [];
  const literal = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = literal.exec(source))) {
    const inner = match[0].slice(1, -1);
    const text = unescapePdfString(inner).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
    if (text.trim()) chunks.push(text);
  }
  const hex = /<([0-9A-Fa-f \t\n\r]+)>/g;
  while ((match = hex.exec(source))) {
    const hexes = match[1].replace(/\s+/g, "");
    if (hexes.length < 4 || hexes.length % 2 !== 0) continue;
    let text = "";
    for (let i = 0; i < hexes.length; i += 2) {
      const code = parseInt(hexes.slice(i, i + 2), 16);
      if (code >= 32 && code <= 126) text += String.fromCharCode(code);
    }
    if (text.trim().length >= 3) chunks.push(text);
  }
  return chunks.join(" ").replace(/[ \t]{2,}/g, " ").replace(/\s+\n/g, "\n").trim();
}

async function inflateBytes(payload: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  const part = copy.buffer as ArrayBuffer;
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([part]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      /* try the other wrapper */
    }
  }
  return null;
}

/**
 * Bounds on how much of a PDF gets inflated. The previous limit of 40 streams
 * was reached by any long document, which then lost every later page without
 * a word of warning. Scans were worse: their leading image streams inflate
 * fine while carrying no text, so the cap could be spent before reaching the
 * OCR text layer at all. These bounds are wide enough for a whole document
 * and still cap the work.
 */
const MAX_INFLATED_STREAMS = 600;
const MAX_INFLATED_BYTES = 4 * 1024 * 1024;
const MAX_INFLATE_MS = 4_000;

async function inflatePdfStreams(data: Uint8Array): Promise<Uint8Array> {
  const raw = latin1(data);
  const parts: Uint8Array[] = [];
  const started = Date.now();
  let inflatedBytes = 0;
  const marker = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const payload = data.subarray(start, end);
    const inflated = await inflateBytes(payload.byteLength > 12 ? payload.subarray(0, payload.byteLength - (raw[end - 1] === "\n" ? 1 : 0)) : payload);
    if (inflated && inflated.byteLength > 16) {
      parts.push(inflated);
      inflatedBytes += inflated.byteLength;
    }
    if (parts.length >= MAX_INFLATED_STREAMS) break;
    if (inflatedBytes >= MAX_INFLATED_BYTES) break;
    if (Date.now() - started >= MAX_INFLATE_MS) break;
  }
  if (!parts.length) return data;
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export async function extractPdfTextFromBytes(data: Uint8Array): Promise<string> {
  const direct = stringsFromPdfSource(latin1(data));
  let inflated = "";
  try {
    inflated = stringsFromPdfSource(latin1(await inflatePdfStreams(data)));
  } catch {
    inflated = "";
  }
  const best = inflated.length > direct.length ? inflated : direct;
  return best.replace(/\0/g, "").trim();
}
