import { spawn } from "node:child_process";
import { getSqlite } from "../db";
import type { ChatCompletionTool } from "../llm-types";

interface JsonRpc {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

export async function listMcpTools(): Promise<ChatCompletionTool[]> {
  const rows = getSqlite()
    .prepare("SELECT * FROM mcp_servers WHERE enabled = 1")
    .all() as {
    id: string;
    name: string;
    transport: string;
    command: string | null;
    args: string | null;
    url: string | null;
  }[];

  const tools: ChatCompletionTool[] = [];
  for (const row of rows) {
    if (row.transport !== "stdio" || !row.command) continue;
    try {
      const listed = await mcpCall(row, "tools/list", {});
      const arr = (listed as { tools?: { name: string; description?: string; inputSchema?: object }[] })
        ?.tools;
      if (!arr) continue;
      for (const t of arr) {
        const safe = `${row.name}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
        tools.push({
          type: "function",
          function: {
            name: `mcp_${safe}`,
            description: `[${row.name}] ${t.description || t.name}`,
            parameters: (t.inputSchema as Record<string, unknown>) || {
              type: "object",
              properties: {},
            },
          },
        });
      }
    } catch {
      /* skip unreachable server */
    }
  }
  return tools;
}

export async function callMcpTool(fnName: string, args: unknown): Promise<string> {
  const rows = getSqlite()
    .prepare("SELECT * FROM mcp_servers WHERE enabled = 1")
    .all() as {
    id: string;
    name: string;
    transport: string;
    command: string | null;
    args: string | null;
  }[];
  for (const row of rows) {
    const prefix = `mcp_${row.name}_`.replace(/[^a-zA-Z0-9_-]/g, "_");
    if (!fnName.startsWith("mcp_")) continue;
    if (row.transport !== "stdio" || !row.command) continue;
    try {
      const listed = await mcpCall(row, "tools/list", {});
      const arr = (listed as { tools?: { name: string }[] })?.tools || [];
      for (const t of arr) {
        const safe = `mcp_${`${row.name}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
        if (safe === fnName) {
          const result = await mcpCall(row, "tools/call", { name: t.name, arguments: args || {} });
          return JSON.stringify(result).slice(0, 20_000);
        }
      }
    } catch (e) {
      return e instanceof Error ? e.message : "MCP call failed";
    }
    void prefix;
  }
  return "Unknown MCP tool";
}

async function mcpCall(
  server: { command: string | null; args: string | null },
  method: string,
  params: unknown,
) {
  const command = server.command!;
  const args = server.args ? server.args.split(/\s+/).filter(Boolean) : [];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
    let buf = "";
    let id = 0;
    const send = (msg: JsonRpc) => {
      const s = JSON.stringify(msg);
      child.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`);
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("MCP timeout"));
    }, 12_000);

    child.stdout.on("data", (chunk) => {
      buf += chunk.toString();
      while (true) {
        const headerEnd = buf.indexOf("\r\n\r\n");
        if (headerEnd < 0) break;
        const header = buf.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) break;
        const len = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (buf.length < bodyStart + len) break;
        const body = buf.slice(bodyStart, bodyStart + len);
        buf = buf.slice(bodyStart + len);
        try {
          const msg = JSON.parse(body) as JsonRpc;
          if (msg.id === 1 && method !== "initialize") return;
          if (msg.result !== undefined || msg.error) {
            clearTimeout(timer);
            child.kill();
            if (msg.error) reject(new Error(msg.error.message || "MCP error"));
            else resolve(msg.result);
          }
        } catch {
          /* ignore parse */
        }
      }
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    send({
      jsonrpc: "2.0",
      id: ++id,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "DeepRomeo", version: "1.0" },
      },
    });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: ++id, method, params });
    }, 150);
  });
}
