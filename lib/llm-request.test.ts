import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCompletionBody,
  capHistory,
  forcesToolCall,
  forgetPinRejections,
  isContextOverflow,
  isPinRejected,
  pinAllowedFor,
  providerErrorMessage,
  rememberPinRejected,
} from "./llm-request.ts";
import { toolChoiceFor } from "./canvas-data.ts";
import type { ComposerTool } from "./types.ts";

const base = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };
const TOOLS = [{ type: "function", function: { name: "create_presentation" } }];

test("a pinned tool call explicitly disables reasoning", () => {
  const body = buildCompletionBody({
    ...base,
    tools: TOOLS,
    toolChoice: { type: "function", function: { name: "create_presentation" } },
  });
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.equal(body.reasoning_effort, undefined);
  assert.deepEqual(body.tool_choice, { type: "function", function: { name: "create_presentation" } });
});

test("ordinary turns still think", () => {
  const withTools = buildCompletionBody({ ...base, tools: TOOLS, toolChoice: "auto" });
  assert.deepEqual(withTools.thinking, { type: "enabled" });
  assert.equal(withTools.reasoning_effort, "high");
  assert.equal(withTools.tool_choice, "auto");

  const noTools = buildCompletionBody({ ...base, tools: [] });
  assert.deepEqual(noTools.thinking, { type: "enabled" });
  assert.equal(noTools.tool_choice, undefined);
  assert.equal(noTools.tools, undefined);
});

test("no plugin can produce the rejected reasoning + pinned-tool pair", () => {
  // The provider answers 400 for that combination, which broke every plugin.
  const plugins: ComposerTool[][] = [
    ["presentations"], ["documents"], ["spreadsheets"], ["pdf"],
    ["canvas"], ["image"], ["search"], ["research"], ["python"],
  ];
  for (const tools of plugins) {
    const choice = toolChoiceFor(tools, null);
    const body = buildCompletionBody({ ...base, tools: TOOLS, toolChoice: choice });
    if (forcesToolCall(choice)) {
      assert.deepEqual(body.thinking, { type: "disabled" }, `${tools[0]} pinned a tool with thinking on`);
    } else {
      assert.deepEqual(body.thinking, { type: "enabled" }, `${tools[0]} lost thinking needlessly`);
    }
  }
});

test("provider failures read as a sentence, not a JSON blob", () => {
  const envelope = JSON.stringify({
    error: {
      message: "Thinking mode does not support this tool_choice",
      type: "invalid_request_error",
      param: null,
      code: "invalid_request_error",
    },
  });
  assert.equal(providerErrorMessage(envelope, 400), "Thinking mode does not support this tool_choice");
  assert.equal(providerErrorMessage("upstream exploded", 500), "upstream exploded");
  assert.equal(providerErrorMessage("", 502), "Request failed (502)");
});

test("context-overflow wording is recognised across phrasings", () => {
  const overflows = [
    "This model's maximum context length is 65536 tokens, however you requested 70000",
    "Input exceeds the context window",
    "prompt is too long",
    "Request exceeds 65536 tokens",
    "token limit reached for this request",
  ];
  for (const message of overflows) {
    assert.equal(isContextOverflow(message), true, `not matched: ${message}`);
  }

  // Must not swallow unrelated failures into the retry path.
  for (const message of [
    "Thinking mode does not support this tool_choice",
    "Invalid API key",
    "Rate limit exceeded",
    "upstream connect error",
  ]) {
    assert.equal(isContextOverflow(message), false, `wrongly matched: ${message}`);
  }
});

function msg(role, content, extra) {
  return { role, content, ...(extra || {}) };
}
const chars = (n) => "x".repeat(n);

test("capHistory drops old turns but keeps the system prompt", () => {
  const messages = [
    msg("system", chars(100)),
    msg("user", chars(5000)),
    msg("assistant", chars(5000)),
    msg("user", chars(5000)),
    msg("assistant", chars(5000)),
    msg("user", chars(1000)),
  ];
  capHistory(messages, 3000);
  assert.equal(messages[0].role, "system", "system prompt must survive");
  assert.equal(messages[messages.length - 1].content, chars(1000), "live question must survive");
  assert.ok(messages.length < 6, "something should have been dropped");
});

test("capHistory never orphans a tool result from its assistant message", () => {
  const messages = [
    msg("system", chars(100)),
    msg("user", chars(60_000)),
    msg("assistant", chars(60_000)),
    msg("user", chars(500)),
    msg("assistant", null, { tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] }),
    msg("tool", chars(200), { tool_call_id: "c1" }),
  ];
  capHistory(messages, 1000);

  const announced = messages.filter((m) => m.tool_calls).flatMap((m) => m.tool_calls.map((t) => t.id));
  const results = messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id);
  for (const id of results) {
    assert.ok(announced.includes(id), `tool result ${id} lost its assistant message`);
  }
  assert.ok(
    messages.some((m) => m.role === "user"),
    "the live user turn must not be dropped",
  );
});

test("an oversized live turn is shortened, not deleted", () => {
  const messages = [
    msg("system", chars(100)),
    msg("user", "PERTANYAAN " + chars(200_000)),
    msg("assistant", null, { tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] }),
    msg("tool", chars(100), { tool_call_id: "c1" }),
  ];
  capHistory(messages, 50_000);

  const user = messages.find((m) => m.role === "user");
  assert.ok(user, "the question must still be there");
  assert.match(user.content, /^PERTANYAAN /, "the start of the question is what matters");
  assert.ok(user.content.length < 200_000, "it should have been shortened");
  assert.match(user.content, /\[truncated\]$/, "shortening must be marked");
  assert.equal(messages.filter((m) => m.role === "tool").length, 1, "tool result kept");
});

test("history under budget is left alone", () => {
  const messages = [msg("system", chars(10)), msg("user", chars(10)), msg("assistant", chars(10))];
  const before = JSON.stringify(messages);
  capHistory(messages, 100_000);
  assert.equal(JSON.stringify(messages), before);
});

test("a rejected pin is recognised, other errors are not", () => {
  assert.equal(isPinRejected("Thinking mode does not support this tool_choice"), true);
  assert.equal(isPinRejected("tool_choice is not supported for this model"), true);
  assert.equal(isPinRejected("This model does not support disabling thinking"), true);
  for (const other of [
    "This model's maximum context length is 65536 tokens",
    "Invalid API key",
    "Rate limit exceeded",
    "terminated",
  ]) {
    assert.equal(isPinRejected(other), false, `wrongly matched: ${other}`);
  }
});

test("a model that rejected a pin is not pinned again", () => {
  forgetPinRejections();
  assert.equal(pinAllowedFor("deepseek-v4-pro"), true);
  rememberPinRejected("deepseek-v4-pro");
  assert.equal(pinAllowedFor("deepseek-v4-pro"), false, "must remember the rejection");
  assert.equal(pinAllowedFor("deepseek-v4-flash"), true, "other models are unaffected");
  forgetPinRejections();
});
