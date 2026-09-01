import { eq } from "drizzle-orm";
import { getDb, getSqlite, schema } from "../db";
import { deepResearch, webSearch } from "./search";
import { runPython } from "./python";
import { generateImage } from "./image";
import { callMcpTool } from "./mcp";
import { runPlugin } from "./plugins";
import {
  asRows,
  asStringList,
  bufferToDataUrl,
  canvasKindFromLanguage,
  newCanvas,
  normalizeSheet,
  normalizeSlides,
  saveGeneratedFile,
  sheetToCsv,
  slidesToMarkdown,
} from "./artifacts";
import { createPdfBuffer, verifyPdfText } from "./pdf";
import type { CanvasState, GeneratedFile, PlanState, SearchSource, Slide } from "../types";

export interface ToolContext {
  canvas: CanvasState | null;
  plan: PlanState | null;
  deliverable: { title: string; html?: string; markdown?: string } | null;
  permission: { id: string; action: string; detail: string } | null;
  images: string[];
  sources: SearchSource[];
  files: GeneratedFile[];
}

// [\s\S] rather than the dotAll flag, which needs an ES2018 target.
const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]*)$/;

const DATA_URL_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

/**
 * Generated media used to travel and persist as base64 data URLs. A single
 * image pushed the message payload past the ~5MB localStorage quota, and
 * persistClientConversation swallows that error, so client-side history
 * silently stopped saving. Store the bytes and hand back a short URL.
 */
function persistDataUrl(dataUrl: string, baseName: string): string {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return dataUrl;
  try {
    const mime = match[1];
    const buf = Buffer.from(match[2], "base64");
    return saveGeneratedFile(`${baseName}${DATA_URL_EXT[mime] || ".bin"}`, buf, mime).url;
  } catch {
    // No writable disk: inline is worse, but better than losing the result.
    return dataUrl;
  }
}

export async function executeTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<{ content: string; ctx: ToolContext }> {
  try {
    return await runTool(name, rawArgs, ctx);
  } catch (error) {
    return {
      content: JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Tool failed",
      }),
      ctx,
    };
  }
}

async function runTool(
  name: string,
  rawArgs: string,
  ctx: ToolContext,
): Promise<{ content: string; ctx: ToolContext }> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    args = {};
  }

  if (name === "web_search") {
    const results = await webSearch(String(args.query || ""));
    for (const result of results) {
      if (!ctx.sources.some((s) => s.url === result.url)) ctx.sources.push(result);
    }
    return {
      content: JSON.stringify({
        results,
        cite_as: results.map((r) => `[${r.title}](${r.url})`),
      }),
      ctx,
    };
  }
  if (name === "deep_research") {
    const pack = await deepResearch(
      String(args.topic || ""),
      Array.isArray(args.questions) ? (args.questions as string[]) : [],
    );
    return { content: JSON.stringify(pack), ctx };
  }
  if (name === "python") {
    const out = await runPython(String(args.code || ""));
    return { content: JSON.stringify(out), ctx };
  }
  if (name === "generate_image") {
    const img = await generateImage(String(args.prompt || ""), String(args.aspect_ratio || "1:1"));
    if ("url" in img && img.url) {
      const url = img.url.startsWith("data:") ? persistDataUrl(img.url, "image") : img.url;
      ctx.images = [...ctx.images, url];
      return { content: JSON.stringify({ ok: true, saved: true }), ctx };
    }
    return { content: JSON.stringify(img), ctx };
  }
  if (name === "open_canvas") {
    const language = String(args.language || "markdown");
    ctx.canvas = newCanvas({
      title: String(args.title || "Canvas"),
      language,
      content: String(args.content || ""),
      kind: canvasKindFromLanguage(language),
    });
    return { content: JSON.stringify({ ok: true, title: ctx.canvas.title, kind: ctx.canvas.kind }), ctx };
  }
  if (name === "update_canvas") {
    if (ctx.canvas) {
      ctx.canvas = {
        ...ctx.canvas,
        content: String(args.content || ctx.canvas.content),
        title: String(args.title || ctx.canvas.title),
      };
    }
    return { content: "Canvas updated.", ctx };
  }
  if (name === "create_document") {
    ctx.canvas = newCanvas({
      title: String(args.title || "Document"),
      content: String(args.content || ""),
      kind: "document",
      language: "markdown",
    });
    return { content: JSON.stringify({ ok: true, title: ctx.canvas.title, kind: "document" }), ctx };
  }
  if (name === "update_document") {
    if (ctx.canvas?.kind === "document" || ctx.canvas?.kind === "code") {
      ctx.canvas = {
        ...ctx.canvas,
        kind: "document",
        language: "markdown",
        content: String(args.content || ctx.canvas.content),
        title: String(args.title || ctx.canvas.title),
      };
    } else {
      ctx.canvas = newCanvas({
        title: String(args.title || "Document"),
        content: String(args.content || ""),
        kind: "document",
        language: "markdown",
      });
    }
    return { content: JSON.stringify({ ok: true, title: ctx.canvas.title, kind: "document" }), ctx };
  }
  if (name === "create_presentation") {
    const slides = normalizeSlides(args.slides);
    const title = String(args.title || "Presentation");
    ctx.canvas = newCanvas({
      title,
      content: slidesToMarkdown(title, slides),
      kind: "presentation",
      language: "slides",
      slides,
    });
    return {
      content: JSON.stringify({ ok: true, title, slides: slides.length, kind: "presentation" }),
      ctx,
    };
  }
  if (name === "update_slide") {
    const nextTitle = args.title != null ? String(args.title) : undefined;
    const nextBullets = args.bullets != null ? asStringList(args.bullets) : undefined;
    const nextNotes = args.notes != null ? String(args.notes) : undefined;
    if (!ctx.canvas?.slides?.length) {
      const slides = normalizeSlides([
        {
          title: nextTitle || "Slide 1",
          bullets: nextBullets || ["Add a talking point"],
          notes: nextNotes,
        },
      ]);
      const title = String(ctx.canvas?.title || args.title || "Presentation");
      ctx.canvas = newCanvas({
        ...(ctx.canvas || {}),
        id: ctx.canvas?.id,
        title,
        content: slidesToMarkdown(title, slides),
        kind: "presentation",
        language: "slides",
        slides,
      });
      return { content: JSON.stringify({ ok: true, created: true, index: 0, title: slides[0].title }), ctx };
    }
    const index = Number(args.index);
    if (!Number.isInteger(index) || index < 0 || index >= ctx.canvas.slides.length) {
      return { content: JSON.stringify({ ok: false, error: "Slide index is out of range." }), ctx };
    }
    const slides = ctx.canvas.slides.map((slide, i) =>
      i === index
        ? {
            ...slide,
            title: nextTitle != null ? nextTitle : slide.title,
            bullets: nextBullets != null ? nextBullets : slide.bullets,
            notes: nextNotes != null ? nextNotes : slide.notes,
          }
        : slide,
    );
    ctx.canvas = {
      ...ctx.canvas,
      slides,
      content: slidesToMarkdown(ctx.canvas.title, slides),
    };
    return { content: JSON.stringify({ ok: true, index, title: slides[index].title }), ctx };
  }
  if (name === "add_slide") {
    const next: Slide = {
      id: crypto.randomUUID(),
      title: String(args.title || "New slide"),
      bullets: asStringList(args.bullets),
      notes: args.notes ? String(args.notes) : undefined,
    };
    const slides = [...(ctx.canvas?.slides || []), next];
    const title = ctx.canvas?.title || String(args.title || "Presentation");
    ctx.canvas = newCanvas({
      ...(ctx.canvas || {}),
      id: ctx.canvas?.id || crypto.randomUUID(),
      title,
      content: slidesToMarkdown(title, slides),
      kind: "presentation",
      language: "slides",
      slides,
    });
    return { content: JSON.stringify({ ok: true, slides: slides.length, title: next.title }), ctx };
  }
  if (name === "create_spreadsheet") {
    const sheet = normalizeSheet(args.headers, args.rows);
    const title = String(args.title || "Spreadsheet");
    ctx.canvas = newCanvas({
      title,
      content: sheetToCsv(sheet),
      kind: "spreadsheet",
      language: "csv",
      sheet,
    });
    return {
      content: JSON.stringify({
        ok: true,
        title,
        columns: sheet.headers.length,
        rows: sheet.rows.length,
      }),
      ctx,
    };
  }
  if (name === "update_spreadsheet") {
    const current = ctx.canvas?.sheet || normalizeSheet(["Column 1"], [[""]]);
    let headers = args.headers != null ? asStringList(args.headers) : current.headers;
    let rows = args.rows != null ? asRows(args.rows) : current.rows;
    if (Array.isArray(args.append_rows)) rows = [...rows, ...asRows(args.append_rows)];
    let sheet = normalizeSheet(headers, rows);
    const cell = args.cell as { row?: number; col?: number; value?: unknown } | undefined;
    if (cell && Number.isInteger(cell.row) && Number.isInteger(cell.col)) {
      const row = Number(cell.row);
      const col = Number(cell.col);
      const nextRows = sheet.rows.map((r) => [...r]);
      while (nextRows.length <= row) nextRows.push(Array.from({ length: sheet.headers.length }, () => ""));
      const width = Math.max(sheet.headers.length, col + 1);
      headers = Array.from({ length: width }, (_, i) => sheet.headers[i] || `Column ${i + 1}`);
      const padded = nextRows.map((r) => Array.from({ length: width }, (_, i) => r[i] || ""));
      padded[row][col] = String(cell.value ?? "");
      sheet = { headers, rows: padded };
    }
    const title = String(args.title || ctx.canvas?.title || "Spreadsheet");
    ctx.canvas = newCanvas({
      ...(ctx.canvas || {}),
      id: ctx.canvas?.id || crypto.randomUUID(),
      title,
      content: sheetToCsv(sheet),
      kind: "spreadsheet",
      language: "csv",
      sheet,
    });
    return {
      content: JSON.stringify({ ok: true, columns: sheet.headers.length, rows: sheet.rows.length }),
      ctx,
    };
  }
  if (name === "create_pdf") {
    const title = String(args.title || "Document");
    const content = String(args.content || "");
    const buf = createPdfBuffer(title, content);
    const dataUrl = bufferToDataUrl(buf, "application/pdf");
    const filename = `${title.replace(/[^a-zA-Z0-9._-]+/g, "-") || "document"}.pdf`;
    let file: GeneratedFile = { name: filename, url: dataUrl, mime: "application/pdf" };
    try {
      file = saveGeneratedFile(filename, buf, "application/pdf");
    } catch {
      /* no writable disk: fall back to the inline data URL */
    }
    ctx.files = [...ctx.files, file];
    ctx.canvas = newCanvas({
      title,
      content,
      kind: "pdf",
      language: "pdf",
      fileUrl: file.url,
      fileName: file.name,
    });
    const report = verifyPdfText(content, { filename: file.name });
    return {
      content: JSON.stringify({ ok: true, title, url: file.url, filename: file.name, verify: report }),
      ctx,
    };
  }
  if (name === "read_pdf") {
    const text = String(args.text || "");
    const title = String(args.title || args.filename || "PDF");
    ctx.canvas = newCanvas({
      title,
      content: text,
      kind: "document",
      language: "markdown",
    });
    return { content: JSON.stringify({ ok: true, title, chars: text.length }), ctx };
  }
  if (name === "verify_pdf") {
    const report = verifyPdfText(String(args.text || ""), {
      filename: args.filename ? String(args.filename) : undefined,
      pages: typeof args.pages === "number" ? args.pages : undefined,
    });
    return { content: JSON.stringify(report), ctx };
  }
  if (name === "create_plan") {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    ctx.plan = {
      title: String(args.title || "Plan"),
      steps: steps.map((s: { id?: string; title?: string }) => ({
        id: String(s.id || crypto.randomUUID()),
        title: String(s.title || "Step"),
        status: "pending" as const,
      })),
    };
    return { content: "Plan created.", ctx };
  }
  if (name === "update_plan") {
    if (ctx.plan) {
      ctx.plan = {
        ...ctx.plan,
        steps: ctx.plan.steps.map((st) =>
          st.id === args.step_id
            ? {
                ...st,
                status: (args.status as typeof st.status) || st.status,
                detail: args.detail ? String(args.detail) : st.detail,
              }
            : st,
        ),
      };
    }
    return { content: "Plan updated.", ctx };
  }
  if (name === "request_permission") {
    ctx.permission = {
      id: crypto.randomUUID(),
      action: String(args.action || "Action"),
      detail: String(args.detail || ""),
    };
    return {
      content: JSON.stringify({
        status: "waiting_for_user",
        permissionId: ctx.permission.id,
      }),
      ctx,
    };
  }
  if (name === "submit_deliverable") {
    ctx.deliverable = {
      title: String(args.title || "Deliverable"),
      markdown: args.markdown ? String(args.markdown) : undefined,
      html: args.html ? String(args.html) : undefined,
    };
    return { content: "Deliverable submitted.", ctx };
  }
  if (name === "remember") {
    const db = getDb();
    await db.insert(schema.memory).values({
      id: crypto.randomUUID(),
      content: String(args.fact || ""),
      createdAt: Date.now(),
    });
    return { content: "Saved to memory.", ctx };
  }
  if (name === "recall_memory") {
    const rows = await getDb().select().from(schema.memory);
    return { content: JSON.stringify(rows.map((r) => r.content)), ctx };
  }
  if (name.startsWith("mcp_")) {
    const out = await callMcpTool(name, args);
    return { content: out, ctx };
  }
  if (name.startsWith("plugin_")) {
    return { content: runPlugin(name, args), ctx };
  }

  return { content: `Unknown tool: ${name}`, ctx };
}

export async function loadMemoryTexts() {
  try {
    const rows = await getDb().select().from(schema.memory);
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}

export async function getSettings() {
  const row = getSqlite().prepare("SELECT value FROM settings WHERE key = 'app'").get() as
    | { value: string }
    | undefined;
  if (!row) return { theme: "system", memoryEnabled: true, spokenLanguage: "Auto" };
  return JSON.parse(row.value) as {
    theme: "system" | "light" | "dark";
    memoryEnabled: boolean;
    spokenLanguage: string;
  };
}

export async function saveSettings(next: Record<string, unknown>) {
  const cur = await getSettings();
  const merged = { ...cur, ...next };
  getSqlite()
    .prepare("INSERT INTO settings (key, value) VALUES ('app', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(merged));
  return merged;
}

export { eq };
