import { getSqlite } from "../db";
import type { ChatCompletionTool } from "../llm-types";

export function pluginTools(): ChatCompletionTool[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM plugins WHERE enabled = 1")
    .all() as { id: string; name: string; manifest: string }[];
  const tools: ChatCompletionTool[] = [];
  for (const row of rows) {
    try {
      const manifest = JSON.parse(row.manifest) as {
        functions?: { name: string; description: string; parameters?: Record<string, unknown> }[];
      };
      for (const fn of manifest.functions || []) {
        tools.push({
          type: "function",
          function: {
            name: `plugin_${fn.name}`.slice(0, 64),
            description: `[${row.name}] ${fn.description}`,
            parameters: fn.parameters || { type: "object", properties: {} },
          },
        });
      }
    } catch {
      /* skip */
    }
  }
  return tools;
}

export function runPlugin(name: string, args: unknown) {
  return JSON.stringify({
    ok: true,
    plugin: name,
    echo: args,
    note: "Plugin executed locally. Connect a live endpoint in Settings for real data.",
  });
}
