import type { CanvasKind, CanvasState, ComposerTool, Slide, SpreadsheetData } from "./types";

export function defaultLanguage(kind: CanvasKind): string {
  if (kind === "spreadsheet") return "csv";
  if (kind === "presentation") return "slides";
  if (kind === "pdf") return "pdf";
  if (kind === "code") return "python";
  return "markdown";
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
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return asStringList(parsed);
    } catch {
      /* plain text */
    }
    return trimmed
      .split(/\n+/)
      .map((item) => item.replace(/^\s*[-*•]\s+/, "").trim())
      .filter((item) => item.length > 0);
  }
  if (!Array.isArray(value)) return [String(value)].filter((item) => item.length > 0);
  return value.map((item) => String(item ?? "")).filter((item) => item.length > 0);
}

export function asRows(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : [String(row ?? "")]));
}

function slideRecord(raw: unknown): { id?: string; title?: string; bullets?: unknown; notes?: string } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return slideRecord(parsed);
    } catch {
      return { title: trimmed, bullets: [] };
    }
  }
  if (!raw || typeof raw !== "object") return {};
  const slide = raw as Record<string, unknown>;
  const bullets = slide.bullets ?? slide.points ?? slide.items ?? slide.content;
  const title = slide.title ?? slide.heading ?? slide.name;
  return {
    id: slide.id != null ? String(slide.id) : undefined,
    title: title != null ? String(title) : undefined,
    bullets,
    notes: slide.notes != null ? String(slide.notes) : undefined,
  };
}

export function normalizeSlides(value: unknown, opts?: { emptyOk?: boolean }): Slide[] {
  let source = value;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) source = [];
    else {
      try {
        source = JSON.parse(trimmed) as unknown;
      } catch {
        source = trimmed.split(/\n(?=#{1,3}\s)/).map((chunk) => {
          const [first, ...rest] = chunk.split("\n");
          return {
            title: first.replace(/^#+\s*/, "").trim() || "Slide",
            bullets: rest,
          };
        });
      }
    }
  }
  if (!Array.isArray(source) || source.length === 0) {
    if (opts?.emptyOk) return [];
    return [{ id: crypto.randomUUID(), title: "Slide 1", bullets: ["Add a talking point"] }];
  }
  return source.map((raw, i) => {
    const slide = slideRecord(raw);
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
  // Spreading a large array into Math.max overflows the call stack.
  const width = data.reduce((w, row) => Math.max(w, row.length), Math.max(cols.length, 1));
  const nextHeaders = Array.from({ length: width }, (_, i) => cols[i] || `Column ${i + 1}`);
  const nextRows =
    data.length > 0
      ? data.map((row) => Array.from({ length: width }, (_, i) => row[i] || ""))
      : [Array.from({ length: width }, () => "")];
  return { headers: nextHeaders, rows: nextRows };
}

export function newCanvas(
  partial: Pick<CanvasState, "title" | "content" | "kind"> & Partial<CanvasState>,
): CanvasState {
  const { language: languageIn, id: idIn, ...rest } = partial;
  const language = languageIn || defaultLanguage(partial.kind);
  const base: CanvasState = {
    ...rest,
    id: idIn || crypto.randomUUID(),
    title: rest.title || "Canvas",
    content: rest.content || "",
    kind: rest.kind,
    language,
  };
  return hydrateCanvas(base);
}

export function hydrateCanvas(raw: CanvasState | null | undefined): CanvasState {
  const canvas = raw && typeof raw === "object" ? raw : ({} as Partial<CanvasState>);
  const kind = canvas.kind || canvasKindFromLanguage(String(canvas.language || "markdown"));
  const language = canvas.language || defaultLanguage(kind);
  const title = canvas.title || (kind === "presentation" ? "Presentation" : "Canvas");
  const id = canvas.id || crypto.randomUUID();
  const content = canvas.content || "";
  if (kind === "presentation") {
    const slides = normalizeSlides(canvas.slides);
    return { ...canvas, id, title, content: content || slidesToMarkdown(title, slides), kind, language, slides };
  }
  if (kind === "spreadsheet") {
    const sheet = canvas.sheet?.headers?.length
      ? normalizeSheet(canvas.sheet.headers, canvas.sheet.rows)
      : normalizeSheet(["Column 1"], [[""]]);
    return { ...canvas, id, title, content: content || sheetToCsv(sheet), kind, language, sheet };
  }
  return { ...canvas, id, title, content, kind, language };
}

function isPlaceholderBullet(text: string) {
  const value = text.trim();
  if (!value) return true;
  return /^add a talking point$/i.test(value) || /^waiting for the deck/i.test(value);
}

export function isEmptyPresentation(canvas: CanvasState | null | undefined) {
  if (!canvas || canvas.kind !== "presentation") return true;
  const slides = canvas.slides || [];
  if (!slides.length) return true;
  return !slides.some((slide) => (slide.bullets || []).some((bullet) => !isPlaceholderBullet(String(bullet || ""))));
}

export type PluginToolChoice = "auto" | "required" | { type: "function"; function: { name: string } };

export function toolChoiceFor(
  tools: ComposerTool[],
  canvas?: CanvasState | null,
  opts?: { hasUploads?: boolean },
): PluginToolChoice {
  if (tools.includes("presentations") && isEmptyPresentation(canvas)) {
    return { type: "function", function: { name: "create_presentation" } };
  }
  if (tools.includes("documents") && canvas?.kind !== "document") {
    return { type: "function", function: { name: "create_document" } };
  }
  if (tools.includes("spreadsheets") && canvas?.kind !== "spreadsheet") {
    return { type: "function", function: { name: "create_spreadsheet" } };
  }
  if (tools.includes("pdf") && !opts?.hasUploads && canvas?.kind !== "pdf") {
    return { type: "function", function: { name: "create_pdf" } };
  }
  if (tools.includes("canvas") && !canvas) {
    return { type: "function", function: { name: "open_canvas" } };
  }
  if (tools.length === 1 && tools[0] === "image") {
    return { type: "function", function: { name: "generate_image" } };
  }
  if (tools.length === 1 && tools[0] === "search") {
    return { type: "function", function: { name: "web_search" } };
  }
  if (tools.length === 1 && tools[0] === "research") {
    return { type: "function", function: { name: "deep_research" } };
  }
  if (tools.length === 1 && tools[0] === "python") {
    return { type: "function", function: { name: "python" } };
  }
  return "auto";
}

export function slidesToMarkdown(title: string, slides: Slide[]): string {
  const parts = [`# ${title || "Presentation"}`, ""];
  slides.forEach((slide, i) => {
    parts.push(`## ${i + 1}. ${slide?.title || `Slide ${i + 1}`}`);
    for (const bullet of slide?.bullets || []) parts.push(`- ${bullet}`);
    if (slide?.notes) parts.push(`\n_Notes: ${slide.notes}_`);
    parts.push("");
  });
  return parts.join("\n").trim() + "\n";
}

export function slidesToHtml(title: string, slides: Slide[]): string {
  const list = Array.isArray(slides) ? slides : [];
  const cards = list
    .map((slide, i) => {
      const bullets = Array.isArray(slide?.bullets) ? slide.bullets : [];
      return `<section class="slide"><div class="num">${i + 1} / ${list.length}</div><h2>${escapeHtml(slide?.title)}</h2><ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#111}.slide{box-sizing:border-box;min-height:100vh;padding:64px 72px;background:#fff;page-break-after:always}h2{font-size:42px;margin:0 0 24px}.num{color:#888;font-size:14px;margin-bottom:20px}ul{font-size:22px;line-height:1.5}</style></head><body>${cards}</body></html>`;
}

export function sheetToCsv(sheet: SpreadsheetData): string {
  const lines = [sheet.headers, ...sheet.rows].map((row) => row.map((cell) => csvCell(cell)).join(","));
  return lines.join("\n") + "\n";
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function escapeHtml(value: string | undefined | null) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
