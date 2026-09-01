import {
  EXTRACT_CHARS_PER_FILE,
  EXTRACT_CHARS_TOTAL,
  LOCAL_UPLOAD_MAX_BYTES,
  VERCEL_UPLOAD_MAX_BYTES,
  attachmentsForChatRequest,
  buildProviderUserText,
  tooLargeError,
} from "../lib/attachments.ts";
import { createPdfBuffer } from "../lib/tools/pdf.ts";

const pdf = createPdfBuffer("Test brief", "Hello DeepRomeo. This is a small PDF for upload verification.");
const { extractText } = await import("unpdf");
const result = await extractText(new Uint8Array(pdf));
const extracted = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
if (!extracted.toLowerCase().includes("hello") && extracted.length < 8) {
  throw new Error(`unpdf extracted too little: ${JSON.stringify(extracted).slice(0, 120)}`);
}

const attachments = [1, 2, 3].map((i) => ({
  id: `id-${i}`,
  name: `paper-${i}.pdf`,
  mime: "application/pdf",
  size: 6_000_000,
  url: "data:application/pdf;base64,AAAA",
  kind: "file" as const,
  text: "PDF body ".repeat(20_000),
}));
const payload = attachmentsForChatRequest(attachments);
const user = buildProviderUserText("analisis", attachments);
const jsonBytes = Buffer.byteLength(JSON.stringify({ message: "analisis", attachments: payload }));
if (payload.length !== 3) throw new Error("expected 3 attachments");
if (jsonBytes > EXTRACT_CHARS_TOTAL + 40_000) throw new Error(`chat payload too large: ${jsonBytes}`);
if (!user.includes("[truncated]")) throw new Error("missing truncation mark");
if (!user.includes("[File: paper-1.pdf]") || !user.includes("[File: paper-3.pdf]")) {
  throw new Error("missing file notes");
}

const sixMb = 6 * 1024 * 1024;
const twentySixMb = 26 * 1024 * 1024;
if (sixMb > LOCAL_UPLOAD_MAX_BYTES) throw new Error("6MB should be allowed locally");
if (twentySixMb <= LOCAL_UPLOAD_MAX_BYTES) throw new Error("26MB should exceed local cap");
if (sixMb <= VERCEL_UPLOAD_MAX_BYTES) throw new Error("6MB should exceed Vercel cap");

console.log(
  JSON.stringify(
    {
      ok: true,
      generatedPdfBytes: pdf.length,
      extractedPreview: extracted.replace(/\s+/g, " ").slice(0, 120),
      perFile: EXTRACT_CHARS_PER_FILE,
      total: EXTRACT_CHARS_TOTAL,
      chatPayloadBytes: jsonBytes,
      userChars: user.length,
      vercelError: tooLargeError("thesis.pdf", VERCEL_UPLOAD_MAX_BYTES),
      localOversizeError: tooLargeError("big.pdf", LOCAL_UPLOAD_MAX_BYTES),
    },
    null,
    2,
  ),
);
