import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCompletionBody, forcesToolCall, providerErrorMessage } from "./llm-request.ts";
import { toolChoiceFor } from "./canvas-data.ts";
import type { ComposerTool } from "./types.ts";

const base = { model: "m", messages: [{ role: "user" as const, content: "hi" }] };
const TOOLS = [{ type: "function", function: { name: "create_presentation" } }];

test("a pinned tool call ships without reasoning", () => {
  const body = buildCompletionBody({
    ...base,
    tools: TOOLS,
    toolChoice: { type: "function", function: { name: "create_presentation" } },
  });
  assert.equal(body.thinking, undefined);
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
      assert.equal(body.thinking, undefined, `${tools[0]} pinned a tool but still sent thinking`);
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
