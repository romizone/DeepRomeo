import { maskError, maskProviderText } from "@/lib/brand";
import {
  attachmentsForChatRequest,
  buildProviderUserText,
  capToolArguments,
  EMPTY_ANALYSIS_MESSAGE,
  PROVIDER_FETCH_TIMEOUT_MS,
} from "@/lib/attachments";
import { getProviderConfig, resolveProviderModel } from "@/lib/provider";
import { getConversation, upsertConversation } from "@/lib/store";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { builtinToolDefs } from "@/lib/tools/defs";
import { executeTool, getSettings, loadMemoryTexts, type ToolContext } from "@/lib/tools/execute";
import { imageDataUrlFromAttachment } from "@/lib/tools/files";
import { imageConfigured } from "@/lib/tools/image";
import { listMcpTools } from "@/lib/tools/mcp";
import { pluginTools } from "@/lib/tools/plugins";
import { getDb, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { ProviderMessage } from "@/lib/llm-types";
import type { Attachment, CanvasState, ComposerTool, Conversation, Message, ModelId, Mode } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Incoming = {
  conversationId?: string;
  message: string;
  mode: Mode;
  model: ModelId;
  tools: ComposerTool[];
  attachments?: Attachment[];
  canvas?: CanvasState | null;
  skillId?: string | null;
  projectId?: string | null;
  temporary?: boolean;
  permissionId?: string;
  permissionApproved?: boolean;
};

function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  let body: Incoming;
  try {
    body = (await req.json()) as Incoming;
  } catch {
    return Response.json({ error: "Permintaan terlalu besar atau tidak valid." }, { status: 400 });
  }
  body.attachments = attachmentsForChatRequest(body.attachments);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
      try {
        await runAgent(body, send);
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: maskError(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runAgent(body: Incoming, send: (obj: unknown) => void) {
  const settings = await getSettings();
  const memory = settings.memoryEnabled ? await loadMemoryTexts() : [];

  let conv = body.conversationId ? await getConversation(body.conversationId) : null;
  const now = Date.now();
  if (!conv) {
    conv = {
      id: body.conversationId || crypto.randomUUID(),
      title: "New chat",
      mode: body.mode,
      model: body.model,
      skillId: body.skillId,
      projectId: body.projectId,
      temporary: Boolean(body.temporary),
      messages: [],
      canvas: null,
      plan: null,
      deliverable: null,
      createdAt: now,
      updatedAt: now,
    };
    send({ type: "conversation", id: conv.id });
  }

  conv.mode = body.mode;
  conv.model = body.model;
  conv.skillId = body.skillId ?? conv.skillId;
  conv.projectId = body.projectId ?? conv.projectId;
  if (body.canvas !== undefined) conv.canvas = body.canvas;

  if (body.permissionId && body.permissionApproved !== undefined) {
    const last = [...conv.messages].reverse().find((m) => m.permission?.id === body.permissionId);
    if (last?.permission) {
      last.permission.status = body.permissionApproved ? "approved" : "denied";
    }
    conv.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      content: body.permissionApproved
        ? `Permission granted for: ${last?.permission?.action || body.permissionId}`
        : `Permission denied for: ${last?.permission?.action || body.permissionId}`,
      createdAt: Date.now(),
    });
  } else {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: body.message,
      attachments: attachmentsForChatRequest(body.attachments),
      createdAt: Date.now(),
    };
    conv.messages.push(userMsg);
  }

  if (conv.title === "New chat" && body.message) {
    conv.title = body.message.slice(0, 48).trim() || "New chat";
    send({ type: "title", title: conv.title, conversationId: conv.id });
  }

  let skillInstructions = "";
  if (conv.skillId) {
    const skillRows = await getDb()
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, conv.skillId));
    skillInstructions = skillRows[0]?.instructions || "";
  }
  let projectInstructions = "";
  if (conv.projectId) {
    const p = await getDb()
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, conv.projectId));
    projectInstructions = p[0]?.instructions || "";
  }

  const enabled = {
    search: true,
    canvas: true,
    python: true,
    research: body.tools.includes("research") || body.mode === "work",
    image: true,
  };

  const tools = [
    ...builtinToolDefs({
      mode: body.mode,
      enabled,
      imageConfigured: imageConfigured(),
    }),
    ...pluginTools(),
  ];
  try {
    tools.push(...(await listMcpTools()));
  } catch {
    /* optional */
  }

  const hasUploads = (body.attachments || []).length > 0;
  const hasImages = (body.attachments || []).some((a) => a.kind === "image");
  const model = resolveProviderModel(hasUploads ? "vision" : body.model, hasImages);
  if (hasUploads && conv.model !== "vision") {
    conv.model = "vision";
    send({ type: "model", model: "vision" });
  }

  const system = buildSystemPrompt({
    mode: conv.mode,
    model: conv.model,
    skillInstructions,
    projectInstructions,
    memory,
    memoryEnabled: settings.memoryEnabled,
    forcedTools: body.tools,
  });

  const messages: ProviderMessage[] = [{ role: "system", content: system }];
  for (const m of conv.messages) {
    if (m.role === "user") {
      const images = (m.attachments || [])
        .map((a) => imageDataUrlFromAttachment(a))
        .filter((url): url is string => Boolean(url));
      const text = buildProviderUserText(m.content, m.attachments);
      if (images.length) {
        messages.push({
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ],
        });
      } else {
        messages.push({ role: "user", content: text });
      }
    } else if (m.role === "assistant") {
      messages.push({
        role: "assistant",
        content: m.content || "",
        reasoning_content: m.thinking || null,
      });
    }
  }

  const ctx: ToolContext = {
    canvas: conv.canvas ?? null,
    plan: conv.plan ?? null,
    deliverable: conv.deliverable ?? null,
    permission: null,
    images: [],
    sources: [],
    files: [],
  };

  const assistantId = crypto.randomUUID();
  send({ type: "assistant_start", id: assistantId });

  let finalContent = "";
  let finalThinking = "";
  let thinkingMs = 0;
  const toolUIs: Message["toolCalls"] = [];
  const thinkStart = Date.now();

  for (let turn = 0; turn < 12; turn++) {
    const result = await streamCompletion({
      model,
      messages,
      tools,
      onThinking: (d) => {
        finalThinking += d;
        send({ type: "thinking", delta: d });
      },
      onContent: (d) => {
        finalContent += d;
        send({ type: "content", delta: maskProviderText(d) });
      },
    });

    thinkingMs = Date.now() - thinkStart;

    if (!result.toolCalls.length) {
      finalContent = result.content || finalContent;
      finalThinking = result.thinking || finalThinking;
      break;
    }

    messages.push({
      role: "assistant",
      content: result.content || null,
      reasoning_content: result.thinking || null,
      tool_calls: result.toolCalls.map((t) => ({
        id: t.id,
        type: "function" as const,
        function: { name: t.name, arguments: capToolArguments(t.name, t.arguments) },
      })),
    });

    for (const call of result.toolCalls) {
      const args = capToolArguments(call.name, call.arguments);
      send({ type: "tool", id: call.id, name: displayToolName(call.name), status: "running" });
      const executed = await executeTool(call.name, args, ctx);
      ctx.canvas = executed.ctx.canvas;
      ctx.plan = executed.ctx.plan;
      ctx.deliverable = executed.ctx.deliverable;
      ctx.permission = executed.ctx.permission;
      ctx.images = executed.ctx.images;
      ctx.sources = executed.ctx.sources;
      ctx.files = executed.ctx.files;
      toolUIs.push({
        id: call.id,
        name: displayToolName(call.name),
        status: "done",
        input: safeJson(args),
        output: safeJson(executed.content),
      });
      send({
        type: "tool",
        id: call.id,
        name: displayToolName(call.name),
        status: "done",
        output: safeJson(executed.content),
      });
      if (ctx.canvas) send({ type: "canvas", canvas: ctx.canvas });
      if (ctx.plan) send({ type: "plan", plan: ctx.plan });
      if (ctx.deliverable) send({ type: "deliverable", deliverable: ctx.deliverable });
      if (ctx.sources.length) send({ type: "sources", sources: ctx.sources });
      for (const url of ctx.images) send({ type: "image", url });
      for (const file of ctx.files) send({ type: "file", file });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: executed.content,
      });
      if (ctx.permission) {
        send({ type: "permission", permission: ctx.permission });
        finalContent =
          result.content ||
          `I need your approval to continue: **${ctx.permission.action}**\n\n${ctx.permission.detail}`;
        turn = 99;
        break;
      }
    }
  }

  if (!finalContent && !ctx.permission && !toolUIs.length) {
    finalContent = EMPTY_ANALYSIS_MESSAGE;
    send({ type: "content", delta: finalContent });
  }

  const assistant: Message = {
    id: assistantId,
    role: "assistant",
    content: maskProviderText(finalContent),
    thinking: finalThinking ? maskProviderText(finalThinking) : undefined,
    thinkingMs,
    toolCalls: toolUIs,
    images: ctx.images.length ? ctx.images : undefined,
    sources: ctx.sources.length ? ctx.sources : undefined,
    files: ctx.files.length ? ctx.files : undefined,
    canvas: ctx.canvas || undefined,
    plan: ctx.plan || undefined,
    permission: ctx.permission
      ? { ...ctx.permission, status: "pending" }
      : undefined,
    createdAt: Date.now(),
  };
  conv.messages.push(assistant);
  conv.canvas = ctx.canvas;
  conv.plan = ctx.plan;
  conv.deliverable = ctx.deliverable;
  conv.updatedAt = Date.now();
  await upsertConversation(conv);
  send({ type: "saved", conversation: { id: conv.id, title: conv.title } });
}

function displayToolName(name: string) {
  const map: Record<string, string> = {
    web_search: "Search",
    deep_research: "Deep research",
    python: "Python",
    open_canvas: "Canvas",
    update_canvas: "Canvas",
    generate_image: "Create image",
    create_document: "Documents",
    update_document: "Documents",
    create_presentation: "Presentations",
    update_slide: "Presentations",
    add_slide: "Presentations",
    create_spreadsheet: "Spreadsheets",
    update_spreadsheet: "Spreadsheets",
    create_pdf: "PDF",
    read_pdf: "PDF",
    verify_pdf: "PDF",
    create_plan: "Plan",
    update_plan: "Plan",
    request_permission: "Permission",
    submit_deliverable: "Deliverable",
    remember: "Memory",
    recall_memory: "Memory",
  };
  return map[name] || name.replace(/^mcp_/, "Connector · ").replace(/^plugin_/, "Plugin · ");
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

async function streamCompletion(opts: {
  model: string;
  messages: ProviderMessage[];
  tools: unknown[];
  onThinking: (d: string) => void;
  onContent: (d: string) => void;
}): Promise<{
  content: string;
  thinking: string;
  toolCalls: { id: string; name: string; arguments: string }[];
}> {
  const { apiKey, baseURL } = getProviderConfig();
  let res: Response;
  try {
    res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(PROVIDER_FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        thinking: { type: "enabled" },
        reasoning_effort: "high",
        tools: opts.tools.length ? opts.tools : undefined,
        tool_choice: opts.tools.length ? "auto" : undefined,
      }),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(EMPTY_ANALYSIS_MESSAGE);
    }
    throw error;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text.slice(0, 500) || `Request failed (${res.status})`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No stream");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let thinking = "";
  const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: {
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
              tool_calls?: {
                index: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }[];
            };
          }[];
        };
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;
        if (delta.reasoning_content) {
          thinking += delta.reasoning_content;
          opts.onThinking(delta.reasoning_content);
        }
        if (delta.content) {
          content += delta.content;
          opts.onContent(delta.content);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const cur = toolAcc.get(tc.index) || { id: "", name: "", arguments: "" };
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.name += tc.function.name;
            if (tc.function?.arguments) cur.arguments += tc.function.arguments;
            toolAcc.set(tc.index, cur);
          }
        }
      } catch {
        /* ignore incomplete json */
      }
    }
  }

  return {
    content,
    thinking,
    toolCalls: [...toolAcc.values()].filter((t) => t.name),
  };
}
