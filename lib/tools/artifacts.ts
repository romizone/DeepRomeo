import fs from "node:fs";
import path from "node:path";
import type { CanvasKind, CanvasState, GeneratedFile, Slide, SpreadsheetData } from "../types";

export function uploadsDir() {
  return process.env.VERCEL
    ? path.join("/tmp", "deepromeo-uploads")
    : path.join(process.cwd(), "uploads");
}

export function saveGeneratedFile(originalName: string, data: Buffer, mime: string): GeneratedFile {
  const dir = uploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const ext =
    path.extname(originalName) ||
    (mime === "application/pdf" ? ".pdf" : mime === "text/csv" ? ".csv" : ".txt");
  const base = path
    .basename(originalName, ext)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "file";
  const stored = `${crypto.randomUUID()}-${base}${ext}`;
  fs.writeFileSync(path.join(dir, stored), data);
  return { name: originalName.endsWith(ext) ? originalName : `${originalName}${ext}`, url: `/api/files/${stored}`, mime };
}

export function newCanvas(
  partial: Pick<CanvasState, "title" | "content" | "kind"> & Partial<CanvasState>,
): CanvasState {
  const { language: languageIn, id: idIn, ...rest } = partial;
  const language =
    languageIn ||
    (partial.kind === "spreadsheet"
      ? "csv"
      : partial.kind === "presentation"
        ? "slides"
        : partial.kind === "pdf"
          ? "pdf"
          : "markdown");
  return {
    ...rest,
    id: idIn || crypto.randomUUID(),
    title: rest.title || "Canvas",
    content: rest.content || "",
    kind: rest.kind,
    language,
  };
}

export function canvasKindFromLanguage(language: string): CanvasKind {
  const lang = (language || "").toLowerCase();
  if (["markdown", "md", "document", "text"].includes(lang)) return "document";
  if (["slides", "presentation"].includes(lang)) return "presentation";
  if (["csv", "tsv", "spreadsheet", "sheet"].includes(lang)) return "spreadsheet";
  if (lang === "pdf") return "pdf";
  return "code";
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "")).filter((item) => item.length > 0);
}

export function asRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")]));
}

export function normalizeSlides(value: unknown): Slide[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: crypto.randomUUID(), title: "Slide 1", bullets: ["Add a talking point"] }];
  }
  return value.map((raw, i) => {
    const slide = (raw && typeof raw === "object" ? raw : {}) as {
      id?: string;
      title?: string;
      bullets?: unknown;
      notes?: string;
    };
    return {
      id: String(slide.id || crypto.randomUUID()),
      title: String(slide.title || `Slide ${i + 1}`),
      bullets: asStringList(slide.bullets),
      notes: slide.notes ? String(slide.notes) : undefined,
    };
  });
}

export function normalizeSheet(headers: unknown, rows: unknown): SpreadsheetData {
  const cols = asStringList(headers);
  const data = asRows(rows);
  const width = Math.max(cols.length, ...data.map((row) => row.length), 1);
  const nextHeaders = Array.from({ length: width }, (_, i) => cols[i] || `Column ${i + 1}`);
  const nextRows =
    data.length > 0
      ? data.map((row) => Array.from({ length: width }, (_, i) => row[i] || ""))
      : [Array.from({ length: width }, () => "")];
  return { headers: nextHeaders, rows: nextRows };
}

export function slidesToMarkdown(title: string, slides: Slide[]): string {
  const parts = [`# ${title}`, ""];
  slides.forEach((slide, i) => {
    parts.push(`## ${i + 1}. ${slide.title}`);
    for (const bullet of slide.bullets) parts.push(`- ${bullet}`);
    if (slide.notes) parts.push(`\n_Notes: ${slide.notes}_`);
    parts.push("");
  });
  return parts.join("\n").trim() + "\n";
}

export function slidesToHtml(title: string, slides: Slide[]): string {
  const cards = slides
    .map(
      (slide, i) => `
<section class="slide">
  <div class="num">${i + 1} / ${slides.length}</div>
  <h2>${escapeHtml(slide.title)}</h2>
  <ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #111; color: #111; }
  .slide { box-sizing: border-box; min-height: 100vh; padding: 64px 72px; background: #fff; page-break-after: always; }
  h2 { font-size: 42px; margin: 0 0 24px; letter-spacing: -0.03em; }
  ul { font-size: 22px; line-height: 1.5; }
  .num { color: #888; font-size: 14px; margin-bottom: 20px; }
</style></head><body>
${cards}
</body></html>`;
}

export function sheetToCsv(sheet: SpreadsheetData): string {
  const lines = [sheet.headers, ...sheet.rows].map((row) =>
    row.map((cell) => csvCell(cell)).join(","),
  );
  return lines.join("\n") + "\n";
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
