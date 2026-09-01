import fs from "node:fs";
import path from "node:path";
import { uploadsDir } from "../storage-paths";
import type { GeneratedFile } from "../types";

export { uploadsDir };

export {
  asRows,
  asStringList,
  canvasKindFromLanguage,
  hydrateCanvas,
  isEmptyPresentation,
  newCanvas,
  normalizeSheet,
  normalizeSlides,
  sheetToCsv,
  slidesToHtml,
  slidesToMarkdown,
} from "../canvas-data";

export function saveGeneratedFile(originalName: string, data: Buffer, mime: string): GeneratedFile {
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const ext =
    path.extname(originalName) ||
    (mime === "application/pdf" ? ".pdf" : mime === "text/csv" ? ".csv" : ".txt");
  const base =
    path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "file";
  const stored = `${crypto.randomUUID()}-${base}${ext}`;
  fs.writeFileSync(path.join(dir, stored), data);
  return {
    name: originalName.endsWith(ext) ? originalName : `${originalName}${ext}`,
    url: `/api/files/${stored}`,
    mime,
  };
}

export function bufferToDataUrl(data: Buffer, mime: string) {
  return `data:${mime};base64,${data.toString("base64")}`;
}
