import { eq } from "drizzle-orm";
import { getDb, getSqlite, schema } from "../db";
import { deepResearch, webSearch } from "./search";
import { runPython } from "./python";
import { generateImage } from "./image";
import { callMcpTool } from "./mcp";
import { runPlugin } from "./plugins";
import type { CanvasState, PlanState } from "../types";

export interface ToolContext {
  canvas: CanvasState | null;
  plan: PlanState | null;
  deliverable: { title: string; html?: string; markdown?: string } | null;
  permission: { id: string; action: string; detail: string } | null;
  images: string[];
}

export async function executeTool(
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
    return { content: JSON.stringify({ results }), ctx };
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
      ctx.images = [...ctx.images, img.url];
      return { content: JSON.stringify({ ok: true, saved: true }), ctx };
    }
    return { content: JSON.stringify(img), ctx };
  }
  if (name === "open_canvas") {
    ctx.canvas = {
      id: crypto.randomUUID(),
      title: String(args.title || "Canvas"),
      language: String(args.language || "markdown"),
      content: String(args.content || ""),
      kind: ["markdown", "md", "document", "text"].includes(
        String(args.language || "markdown").toLowerCase(),
      )
        ? "document"
        : "code",
    };
    return { content: "Canvas opened.", ctx };
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
