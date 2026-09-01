import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { truncateExtractedText } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";

export async function extractFileText(filePath: string, mime: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase();
  const imageExt = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".bmp"];
  if (mime.startsWith("image/") || imageExt.includes(ext)) {
    return {
      kind: "image" as const,
      text: `[Image attached: ${originalName}]`,
    };
  }

  if (ext === ".pdf" || mime === "application/pdf") {
    try {
      const { extractText } = await import("unpdf");
      const data = new Uint8Array(await fsPromises.readFile(filePath));
      const result = await extractText(data);
      const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
      return { kind: "file" as const, text: truncateExtractedText(text) };
    } catch {
      return { kind: "file" as const, text: `[Could not read PDF: ${originalName}]` };
    }
  }

  if (ext === ".docx" || mime.includes("wordprocessingml")) {
    try {
      const buf = await fsPromises.readFile(filePath);
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { kind: "file" as const, text: truncateExtractedText(value) };
    } catch {
      return { kind: "file" as const, text: `[Could not read Word file: ${originalName}]` };
    }
  }

  const text = await fsPromises.readFile(filePath, "utf8").catch(() => "");
  return { kind: "file" as const, text: truncateExtractedText(text) };
}

export function imageDataUrlFromAttachment(attachment: Attachment): string | null {
  if (attachment.kind !== "image") return null;
  const url = attachment.url || "";
  if (url.startsWith("data:")) return url;
  const fileName = url.startsWith("/api/files/") ? path.basename(url.split("?")[0]) : "";
  if (!fileName) return null;
  const candidates = [
    path.join("/tmp", "deepromeo-uploads", fileName),
    path.join(process.cwd(), "uploads", fileName),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) return null;
  try {
    const buf = fs.readFileSync(file);
    const mime = attachment.mime || "image/png";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
