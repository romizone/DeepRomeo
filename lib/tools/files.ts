import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

export async function extractFileText(filePath: string, mime: string, originalName: string) {
  const ext = path.extname(originalName).toLowerCase();
  if (mime.startsWith("image/")) {
    const buf = await fs.readFile(filePath);
    const b64 = buf.toString("base64");
    return {
      kind: "image" as const,
      text: `[Image attached: ${originalName}]`,
      dataUrl: `data:${mime};base64,${b64}`,
    };
  }

  if (ext === ".pdf" || mime === "application/pdf") {
    try {
      const { extractText } = await import("unpdf");
      const data = new Uint8Array(await fs.readFile(filePath));
      const result = await extractText(data);
      const text = Array.isArray(result.text) ? result.text.join("\n") : String(result.text || "");
      return { kind: "file" as const, text: text.slice(0, 80_000) };
    } catch {
      return { kind: "file" as const, text: `[Could not read PDF: ${originalName}]` };
    }
  }

  if (ext === ".docx" || mime.includes("wordprocessingml")) {
    const buf = await fs.readFile(filePath);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { kind: "file" as const, text: value.slice(0, 80_000) };
  }

  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  return { kind: "file" as const, text: text.slice(0, 80_000) };
}
