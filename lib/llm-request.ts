import type { ProviderMessage } from "./llm-types";

export type ToolChoice =
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export interface CompletionRequest {
  model: string;
  messages: ProviderMessage[];
  tools: unknown[];
  toolChoice?: ToolChoice;
}

/** Anything but "auto" pins which tool the model has to call next. */
export function forcesToolCall(choice: ToolChoice | undefined): boolean {
  return Boolean(choice) && choice !== "auto";
}

/**
 * The provider answers 400 "Thinking mode does not support this tool_choice"
 * when reasoning is enabled and the call is pinned to a named function. Since
 * reasoning used to be sent unconditionally, every request that a plugin
 * pinned — presentations, documents, spreadsheets, image, search — failed
 * outright. Only the pinning turn drops reasoning; later turns run on "auto"
 * and think as before.
 */
export function buildCompletionBody(req: CompletionRequest): Record<string, unknown> {
  const hasTools = req.tools.length > 0;
  const toolChoice = hasTools ? req.toolChoice || "auto" : undefined;
  const reasoning = forcesToolCall(toolChoice)
    ? {}
    : { thinking: { type: "enabled" }, reasoning_effort: "high" };

  return {
    model: req.model,
    messages: req.messages,
    stream: true,
    ...reasoning,
    tools: hasTools ? req.tools : undefined,
    tool_choice: toolChoice,
  };
}

/** Provider failures arrive as a JSON envelope; the raw blob is noise to a reader. */
export function providerErrorMessage(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: unknown } };
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    /* not a JSON envelope */
  }
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 300) : `Request failed (${status})`;
}

/** Providers word this differently; match the shapes they all share. */
const CONTEXT_OVERFLOW_RE =
  /context.{0,12}(length|window)|maximum context|too many tokens|token.{0,10}limit|prompt is too long|exceeds?.{0,20}tokens/i;

export function isContextOverflow(message: string): boolean {
  return CONTEXT_OVERFLOW_RE.test(message);
}
