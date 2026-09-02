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

const MIN_KEPT_USER_CHARS = 2_000;
const TRUNCATION_NOTE = "\n\n[truncated]";

function measureMessage(m: ProviderMessage): number {
  if (typeof m.content === "string") return m.content.length;
  if (Array.isArray(m.content)) {
    return m.content.reduce(
      (n, part) => n + (part.type === "text" ? part.text.length : part.image_url.url.length),
      0,
    );
  }
  return 0;
}

/**
 * Trims replayed history to a character budget.
 *
 * Only history older than the live exchange may go. The live exchange is the
 * newest user turn plus everything after it — its tool round-trips. Trimming
 * into that either deletes the question the model is answering, or leaves a
 * tool result whose announcing assistant message is gone, which the provider
 * rejects outright.
 *
 * When the live exchange alone overshoots (a large attachment), the newest
 * turn's text is shortened instead of dropped, so the question survives.
 */
export function capHistory(messages: ProviderMessage[], budget: number): void {
  if (messages.length < 2) return;

  let liveFrom = messages.length - 1;
  for (let i = messages.length - 1; i >= 1; i--) {
    if (messages[i].role === "user") {
      liveFrom = i;
      break;
    }
  }

  let total = messages.reduce((n, m) => n + measureMessage(m), 0);
  let drop = 1;
  while (total > budget && drop < liveFrom) {
    total -= measureMessage(messages[drop]);
    drop++;
  }
  if (drop > 1) {
    messages.splice(1, drop - 1);
    liveFrom -= drop - 1;
  }
  if (total <= budget) return;

  const live = messages[liveFrom];
  if (!live || typeof live.content !== "string") return;
  const excess = total - budget;
  const keep = Math.max(MIN_KEPT_USER_CHARS, live.content.length - excess - TRUNCATION_NOTE.length);
  if (keep < live.content.length) {
    live.content = live.content.slice(0, keep) + TRUNCATION_NOTE;
  }
}

/**
 * "Thinking mode does not support this tool_choice". Omitting the `thinking`
 * parameter is enough for models where reasoning is opt-in, but a
 * reasoning-only model thinks regardless and rejects a pinned tool_choice no
 * matter what was sent. The turn has to fall back to "auto".
 */
const TOOL_CHOICE_REJECTED_RE = /does not support (?:this |the )?tool_choice|tool_choice.{0,40}not supported/i;

export function isToolChoiceRejected(message: string): boolean {
  return TOOL_CHOICE_REJECTED_RE.test(message);
}
