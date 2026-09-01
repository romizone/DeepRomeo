import { spawn } from "node:child_process";
import { getSqlite } from "../db";
import type { ChatCompletionTool } from "../llm-types";

const SESSION_TIMEOUT_MS = 12_000;
const LIST_CACHE_MS = 60_000;
const MAX_RESULT_CHARS = 20_000;

interface JsonRpc {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { message?: string };
}

interface McpServerRow {
  id: string;
  name: string;
  transport: string;
  command: string | null;
  args: string | null;
}

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

const listCache = new Map<string, { at: number; tools: McpToolInfo[] }>();

function enabledServers(): McpServerRow[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM mcp_servers WHERE enabled = 1")
    .all() as McpServerRow[];
  return rows.filter((row) => row.transport === "stdio" && Boolean(row.command));
}

/**
 * One canonical name for a server+tool pair. The lister and the caller used to
 * derive this differently (slicing before vs. after the `mcp_` prefix), so any
 * name near the 64-char limit was unresolvable at call time.
 */
function toolKey(serverName: string, toolName: string): string {
  return `mcp_${`${serverName}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);
}

interface Session {
  request: (method: string, params?: unknown) => Promise<unknown>;
  notify: (method: string, params?: unknown) => void;
  close: () => void;
}

/**
 * MCP's stdio transport is newline-delimited JSON-RPC. This previously used
 * LSP-style `Content-Length` framing, which no MCP server speaks — so every
 * connector silently failed to hand over its tools.
 */
/**
 * Splitting on whitespace broke any argument containing a space — a Windows
 * path, a directory under "My Documents", a quoted JSON blob. Honour quotes.
 */
export function parseArgs(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let started = false;
  for (const ch of raw) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
      continue;
    }
    if (/\s/.test(ch)) {
      if (started || current) out.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
  }
  if (started || current) out.push(current);
  return out;
}

function openSession(server: McpServerRow): Session {
  const args = parseArgs(server.args);
  const child = spawn(/* turbopackIgnore: true */ server.command as string, args, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 0;
  let buffer = "";
  let failure: Error | null = null;

  const fail = (error: Error) => {
    failure = failure || error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          const msg = JSON.parse(line) as JsonRpc;
          const waiter = typeof msg.id === "number" ? pending.get(msg.id) : undefined;
          if (waiter) {
            pending.delete(msg.id as number);
            if (msg.error) waiter.reject(new Error(msg.error.message || "MCP error"));
            else waiter.resolve(msg.result);
          }
        } catch {
          /* server notifications and stray output are not our concern */
        }
      }
      newline = buffer.indexOf("\n");
    }
  });
  // stderr is where MCP servers log; draining it stops the pipe filling up.
  child.stderr.resume();
  child.on("error", (error) => fail(error instanceof Error ? error : new Error("MCP spawn failed")));
  child.on("close", () => fail(new Error("MCP server closed the connection")));

  // A server that has already exited leaves stdin closed; an unhandled 'error'
  // on the stream would take the whole process down with it.
  child.stdin.on("error", (error) =>
    fail(error instanceof Error ? error : new Error("MCP stdin closed")),
  );

  const write = (msg: JsonRpc) => {
    if (failure || child.stdin.destroyed || !child.stdin.writable) return;
    try {
      child.stdin.write(`${JSON.stringify(msg)}\n`);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("MCP write failed"));
    }
  };

  return {
    request(method, params) {
      return new Promise<unknown>((resolve, reject) => {
        if (failure) {
          reject(failure);
          return;
        }
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        write({ jsonrpc: "2.0", id, method, params });
      });
    },
    notify(method, params) {
      if (failure) return;
      write({ jsonrpc: "2.0", method, params });
    },
    close() {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MCP timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Runs one handshake + request cycle against a server and tears it down. */
async function mcpSession<T>(server: McpServerRow, run: (session: Session) => Promise<T>): Promise<T> {
  const session = openSession(server);
  try {
    return await withTimeout(
      (async () => {
        await session.request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "DeepRomeo", version: "1.0" },
        });
        session.notify("notifications/initialized");
        return run(session);
      })(),
      SESSION_TIMEOUT_MS,
    );
  } finally {
    session.close();
  }
}

async function listServerTools(server: McpServerRow): Promise<McpToolInfo[]> {
  const cached = listCache.get(server.id);
  if (cached && Date.now() - cached.at < LIST_CACHE_MS) return cached.tools;
  const result = await mcpSession(server, (session) => session.request("tools/list", {}));
  const tools = ((result as { tools?: McpToolInfo[] })?.tools || []).filter((t) => t?.name);
  listCache.set(server.id, { at: Date.now(), tools });
  return tools;
}

export async function listMcpTools(): Promise<ChatCompletionTool[]> {
  const servers = enabledServers();
  if (!servers.length) return [];

  // Every chat message hits this. Doing it in parallel keeps the worst case at
  // one timeout instead of one per server, and the cache keeps most calls free.
  const settled = await Promise.allSettled(
    servers.map(async (server) => ({ server, tools: await listServerTools(server) })),
  );

  const defs: ChatCompletionTool[] = [];
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    const { server, tools } = outcome.value;
    for (const tool of tools) {
      defs.push({
        type: "function",
        function: {
          name: toolKey(server.name, tool.name),
          description: `[${server.name}] ${tool.description || tool.name}`,
          parameters: tool.inputSchema || { type: "object", properties: {} },
        },
      });
    }
  }
  return defs;
}

export async function callMcpTool(fnName: string, args: unknown): Promise<string> {
  if (!fnName.startsWith("mcp_")) return "Unknown MCP tool";

  for (const server of enabledServers()) {
    let tools: McpToolInfo[];
    try {
      tools = await listServerTools(server);
    } catch {
      continue;
    }
    const match = tools.find((tool) => toolKey(server.name, tool.name) === fnName);
    if (!match) continue;
    try {
      const result = await mcpSession(server, (session) =>
        session.request("tools/call", { name: match.name, arguments: args || {} }),
      );
      return JSON.stringify(result).slice(0, MAX_RESULT_CHARS);
    } catch (error) {
      return JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "MCP call failed",
      });
    }
  }
  return "Unknown MCP tool";
}
