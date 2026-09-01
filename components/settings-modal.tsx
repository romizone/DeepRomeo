"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { PLUGIN_CATALOG } from "@/lib/plugin-catalog";
import type { AppSettings, McpServer, MemoryItem, Plugin, Skill } from "@/lib/types";
import { PluginIcon } from "./plugin-icons";

type Tab = "general" | "personalization" | "connectors" | "plugins" | "builder";

export function SettingsModal({
  open,
  onClose,
  theme,
  onTheme,
}: {
  open: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  onTheme: (t: "light" | "dark" | "system") => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [memory, setMemory] = useState<MemoryItem[]>([]);
  const [mcp, setMcp] = useState<McpServer[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/settings").then((r) => r.json()),
      fetch("/api/memory").then((r) => r.json()),
      fetch("/api/mcp").then((r) => r.json()),
      fetch("/api/plugins").then((r) => r.json()),
      fetch("/api/skills").then((r) => r.json()),
    ])
      .then(([s, m, c, p, sk]) => {
        setSettings(s.settings);
        setMemory(m.memory || []);
        setMcp(c.servers || []);
        setPlugins(p.plugins || []);
        setSkills(sk.skills || []);
      })
      .catch(() => {
        /* leave whatever loaded last in place rather than an empty panel */
      });
  }, [open]);

  if (!open) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "personalization", label: "Personalization" },
    { id: "connectors", label: "Connectors" },
    { id: "plugins", label: "Plugins" },
    { id: "builder", label: "Builder" },
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--overlay)] p-4">
      <div className="flex h-[min(640px,86vh)] w-full max-w-[820px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        <nav className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-sidebar)] p-2">
          <div className="px-3 py-2 text-[13px] font-semibold">Settings</div>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex w-full rounded-lg px-3 py-2 text-left text-[13.5px] ${
                tab === t.id ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
            <div className="text-[14px] font-semibold capitalize">{tab}</div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
              <X size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5 dr-scroll">
            {tab === "general" && (
              <div className="space-y-5">
                <Field label="Theme">
                  <select
                    value={theme}
                    onChange={(e) => onTheme(e.target.value as "light" | "dark")}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[14px]"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </Field>
                <p className="text-[13px] text-[var(--text-3)]">
                  DeepRomeo on openromeo.rominur.com and deepromeo.rominur.com.
                </p>
              </div>
            )}
            {tab === "personalization" && (
              <div className="space-y-4">
                <label className="flex items-center justify-between text-[14px]">
                  Memory
                  <input
                    type="checkbox"
                    checked={settings?.memoryEnabled ?? true}
                    onChange={async (e) => {
                      const res = await fetch("/api/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ memoryEnabled: e.target.checked }),
                      });
                      const json = await res.json();
                      setSettings(json.settings);
                    }}
                  />
                </label>
                <div className="text-[13px] font-medium">Saved memories</div>
                {memory.length === 0 && (
                  <div className="text-[13px] text-[var(--text-3)]">No memories yet.</div>
                )}
                {memory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]"
                  >
                    <span>{item.content}</span>
                    <button
                      type="button"
                      className="text-[var(--danger)]"
                      onClick={async () => {
                        await fetch("/api/memory", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: item.id }),
                        });
                        setMemory(memory.filter((m) => m.id !== item.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            {tab === "connectors" && (
              <McpTab servers={mcp} onChange={setMcp} />
            )}
            {tab === "plugins" && <PluginsTab plugins={plugins} onChange={setPlugins} />}
            {tab === "builder" && <BuilderTab skills={skills} onChange={setSkills} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4 text-[14px]">
      {label}
      {children}
    </label>
  );
}

function McpTab({
  servers,
  onChange,
}: {
  servers: McpServer[];
  onChange: (s: McpServer[]) => void;
}) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-2)]">
        Connect MCP servers. Tools appear automatically in Chat and Work.
      </p>
      {servers.map((s) => (
        <div key={s.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]">
          <div>
            <div className="font-medium">{s.name}</div>
            <div className="text-[var(--text-3)]">
              {s.transport} {s.command}
            </div>
          </div>
          <button
            type="button"
            className="text-[var(--danger)]"
            onClick={async () => {
              await fetch("/api/mcp", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: s.id }),
              });
              onChange(servers.filter((x) => x.id !== s.id));
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <div className="grid gap-2">
        <input
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
        />
        <input
          placeholder="Command (npx)"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
        />
        <input
          placeholder="Args"
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
        />
        <button
          type="button"
          className="rounded-full bg-[var(--send-bg)] px-4 py-2 text-[13px] font-medium text-[var(--send-fg)]"
          onClick={async () => {
            if (!name || !command) return;
            const res = await fetch("/api/mcp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, command, args, transport: "stdio" }),
            });
            const json = await res.json();
            onChange([...servers, json.server]);
            setName("");
            setCommand("");
            setArgs("");
          }}
        >
          Add connector
        </button>
      </div>
    </div>
  );
}

function PluginsTab({
  plugins,
  onChange,
}: {
  plugins: Plugin[];
  onChange: (p: Plugin[]) => void;
}) {
  const [name, setName] = useState("");
  const [manifest, setManifest] = useState(
    `{
  "functions": [
    { "name": "echo", "description": "Echo arguments", "parameters": { "type": "object", "properties": { "text": { "type": "string" } } } }
  ]
}`,
  );
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-2)]">
        Built-in plugins appear in the composer + menu. Custom plugins add extra tools.
      </p>
      <div className="space-y-1">
        {PLUGIN_CATALOG.map((item) => (
          <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-2">
            <PluginIcon name={item.icon} size={20} />
            <div>
              <div className="text-[13px] font-semibold">{item.title}</div>
              <div className="text-[12px] text-[var(--text-3)]">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
      {plugins.map((p) => (
        <div key={p.id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]">
          <div className="font-medium">{p.name}</div>
          <div className="text-[var(--text-3)]">{p.description}</div>
        </div>
      ))}
      <input
        placeholder="Plugin name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
      />
      <textarea
        value={manifest}
        onChange={(e) => setManifest(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[12px]"
      />
      <button
        type="button"
        className="rounded-full bg-[var(--send-bg)] px-4 py-2 text-[13px] font-medium text-[var(--send-fg)]"
        onClick={async () => {
          if (!name) return;
          try {
            const parsed = JSON.parse(manifest);
            const res = await fetch("/api/plugins", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, manifest: parsed }),
            });
            const json = await res.json();
            onChange([...plugins, { ...json.plugin, manifest: parsed }]);
            setName("");
          } catch {
            alert("Invalid JSON");
          }
        }}
      >
        Add plugin
      </button>
    </div>
  );
}

function BuilderTab({
  skills,
  onChange,
}: {
  skills: Skill[];
  onChange: (s: Skill[]) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [markdown, setMarkdown] = useState("# Skill\n\nInstructions for the assistant.");
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-[var(--text-2)]">
        Create a custom GPT from a SKILL.md. It shows up in GPTs and can be attached to a chat.
      </p>
      {skills
        .filter((s) => !s.builtin)
        .map((s) => (
          <div key={s.id} className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]">
            {s.name}
          </div>
        ))}
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
      />
      <input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-[14px]"
      />
      <textarea
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 font-mono text-[12px]"
      />
      <button
        type="button"
        className="rounded-full bg-[var(--send-bg)] px-4 py-2 text-[13px] font-medium text-[var(--send-fg)]"
        onClick={async () => {
          if (!name) return;
          const res = await fetch("/api/skills", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, markdown, instructions: markdown }),
          });
          const json = await res.json();
          onChange([...skills, json.skill]);
          setName("");
        }}
      >
        Create GPT
      </button>
    </div>
  );
}
