"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Ellipsis, Shield } from "lucide-react";
import { CanvasPanel } from "./canvas-panel";
import { Composer } from "./composer";
import { GptsView } from "./gpts-view";
import { MessageThread } from "./message-thread";
import { ModeSwitcher } from "./mode-switcher";
import { ModelPicker } from "./model-picker";
import { SearchChats } from "./search-chats";
import { SettingsModal } from "./settings-modal";
import { Sidebar } from "./sidebar";
import { WorkPanel } from "./work-panel";
import {
  attachmentsForChatRequest,
  CHAT_STALL_MS,
  EMPTY_ANALYSIS_MESSAGE,
  tooLargeError,
  VERCEL_UPLOAD_MAX_BYTES,
} from "@/lib/attachments";
import { hydrateCanvas } from "@/lib/canvas-data";
import { placeholderCanvasForTools } from "@/lib/plugin-catalog";
import type {
  Attachment,
  CanvasState,
  ComposerTool,
  Conversation,
  GeneratedFile,
  Message,
  Mode,
  ModelId,
  PlanState,
  Project,
  SearchSource,
  Skill,
} from "@/lib/types";

const CHAT_CHIPS: { label: string; prompt: string; tool?: ComposerTool }[] = [
  { label: "Create image", prompt: "Create an image of a serene mountain lake at dawn", tool: "image" },
  { label: "Create a deck", prompt: "Buat presentasi tentang strategi produk kuartalan.", tool: "presentations" },
  { label: "Write a document", prompt: "Write a one-page brief about remote work best practices.", tool: "documents" },
  { label: "Help me write", prompt: "Help me write " },
  { label: "Analyze data", prompt: "Analyze this data and show the key takeaways.", tool: "spreadsheets" },
  { label: "Surprise me", prompt: "Surprise me with something fascinating." },
  { label: "Code", prompt: "Write a Python function that ", tool: "python" },
];

const WORK_CHIPS: { label: string; prompt: string; tool?: ComposerTool }[] = [
  { label: "Create a deck", prompt: "Create a slide deck about quarterly product strategy.", tool: "presentations" },
  { label: "Analyze a spreadsheet", prompt: "Create a spreadsheet of quarterly revenue by region and highlight the key takeaways.", tool: "spreadsheets" },
  { label: "Draft a report", prompt: "Draft a professional report on market expansion.", tool: "documents" },
  { label: "Build a project plan", prompt: "Build a project plan for launching a new app." },
];

function emptyConv(partial: Partial<Conversation> = {}): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    mode: "chat",
    model: "flash",
    messages: [],
    canvas: null,
    plan: null,
    deliverable: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function applyTheme(theme: "light" | "dark") {
  document.documentElement.setAttribute("data-theme", theme);
}

export function AppShell({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mode, setMode] = useState<Mode>("chat");
  const [model, setModel] = useState<ModelId>("flash");
  const [tools, setTools] = useState<ComposerTool[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [conv, setConv] = useState<Conversation>(() => emptyConv());
  const [recents, setRecents] = useState<Conversation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [gptsOpen, setGptsOpen] = useState(pathname === "/gpts");
  const [moreOpen, setMoreOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const loadLists = useCallback(async () => {
    try {
      const [c, p, s] = await Promise.all([
        fetch("/api/conversations").then((r) => r.json()).catch(() => ({})),
        fetch("/api/projects").then((r) => r.json()).catch(() => ({})),
        fetch("/api/skills").then((r) => r.json()).catch(() => ({})),
      ]);
      setRecents(Array.isArray(c.conversations) ? c.conversations : []);
      setProjects(Array.isArray(p.projects) ? p.projects : []);
      setSkills(Array.isArray(s.skills) ? s.skills : []);
    } catch {
      /* keep last known lists so the shell still renders */
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("dr-theme") as "light" | "dark" | null;
    const next =
      saved ||
      (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    setTheme(next);
    applyTheme(next);
    if (window.innerWidth < 768) setSidebarOpen(false);
    void loadLists();
  }, [loadLists]);

  useEffect(() => {
    setGptsOpen(pathname === "/gpts");
  }, [pathname]);

  useEffect(() => {
    if (!conversationId) {
      setConv(emptyConv({ mode, model }));
      setCanvasOpen(false);
      setWorkOpen(mode === "work");
      return;
    }
    void fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json?.conversation) return;
        const c = json.conversation as Conversation;
        setConv(c);
        setMode(c.mode || "chat");
        setModel(c.model || "flash");
        setCanvasOpen(Boolean(c.canvas));
        setWorkOpen(c.mode === "work" || Boolean(c.plan || c.deliverable));
      })
      .catch(() => {
        /* stay on empty conversation rather than a blank shell */
      });
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [conv.messages, streaming]);

  const newChat = (opts: Partial<Conversation> = {}) => {
    abortRef.current?.abort();
    setStreaming(false);
    setAttachments([]);
    setTools([]);
    const next = emptyConv({ mode, model, ...opts });
    setConv(next);
    setCanvasOpen(false);
    setWorkOpen(mode === "work");
    setGptsOpen(false);
    router.push("/");
  };

  const send = async (
    text: string,
    extra?: { permissionId?: string; permissionApproved?: boolean; extraTools?: ComposerTool[] },
  ) => {
    const content = text || extra?.permissionId ? text : "";
    if (!content && !attachments.length && !extra?.permissionId) return;

    const activeTools = extra?.extraTools ? [...new Set([...tools, ...extra.extraTools])] : tools;
    const safeAttachments = attachments.length ? attachmentsForChatRequest(attachments) : [];
    const userMsg: Message | null = extra?.permissionId
      ? null
      : {
          id: crypto.randomUUID(),
          role: "user",
          content,
          attachments: safeAttachments.length ? safeAttachments : undefined,
          createdAt: Date.now(),
        };

    const assistantId = crypto.randomUUID();
    const draftCanvas = placeholderCanvasForTools(activeTools);
    const localCanvas = conv.canvas
      ? hydrateCanvas(conv.canvas)
      : draftCanvas
        ? hydrateCanvas({ ...draftCanvas, id: crypto.randomUUID() })
        : null;
    setConv((prev) => ({
      ...prev,
      mode,
      model,
      canvas: prev.canvas ? hydrateCanvas(prev.canvas) : localCanvas,
      messages: [
        ...prev.messages,
        ...(userMsg ? [userMsg] : []),
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
        },
      ],
    }));
    setAttachments([]);
    setStreaming(true);
    setStreamingId(assistantId);
    if (mode === "work") setWorkOpen(true);
    if (localCanvas) setCanvasOpen(true);

    const ac = new AbortController();
    abortRef.current = ac;
    let localId = conv.id;
    let accContent = "";
    let accThink = "";
    let stallTimedOut = false;
    let sawResult = false;
    const images: string[] = [];
    const files: GeneratedFile[] = [];
    const sources: SearchSource[] = [];
    let stallTimer: number | null = null;
    const bumpStall = () => {
      if (stallTimer) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        stallTimedOut = true;
        ac.abort();
      }, CHAT_STALL_MS);
    };

    try {
      bumpStall();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          conversationId: conversationId || (conv.messages.length ? conv.id : undefined),
          message: content,
          mode,
          model,
          tools: activeTools,
          attachments: safeAttachments,
          canvas: localCanvas,
          skillId: conv.skillId,
          projectId: conv.projectId,
          temporary: conv.temporary,
          permissionId: extra?.permissionId,
          permissionApproved: extra?.permissionApproved,
        }),
      });
      if (!res.ok) {
        let msg = res.status === 413 ? tooLargeError("upload.pdf", VERCEL_UPLOAD_MAX_BYTES) : "Something went wrong. Please try again.";
        try {
          const errJson = (await res.json()) as { error?: string; message?: string };
          msg = errJson.error || errJson.message || msg;
        } catch {
          /* keep status fallback */
        }
        throw new Error(msg);
      }
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bumpStall();
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          let ev: Record<string, unknown>;
          try {
            ev = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          } catch {
            continue;
          }
          const type = ev.type as string;
          if (type === "content" || type === "tool" || type === "permission" || type === "error") {
            sawResult = true;
          }
          if (type === "conversation") {
            localId = String(ev.id);
            setConv((p) => ({ ...p, id: localId }));
            if (!conversationId) router.replace(`/c/${localId}`);
          }
          if (type === "title") {
            setConv((p) => ({ ...p, title: String(ev.title) }));
          }
          if (type === "model") setModel(ev.model as ModelId);
          if (type === "thinking") {
            accThink += String(ev.delta || "");
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, thinking: accThink } : m,
              ),
            }));
          }
          if (type === "content") {
            accContent += String(ev.delta || "");
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, content: accContent } : m,
              ),
            }));
          }
          if (type === "tool") {
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) => {
                if (m.id !== assistantId) return m;
                const calls = [...(m.toolCalls || [])];
                const idx = calls.findIndex((t) => t.id === ev.id);
                const next = {
                  id: String(ev.id),
                  name: String(ev.name),
                  status: ev.status as "running" | "done",
                  output: ev.output,
                };
                if (idx >= 0) calls[idx] = { ...calls[idx], ...next };
                else calls.push(next);
                return { ...m, toolCalls: calls };
              }),
            }));
          }
          if (type === "canvas") {
            setCanvasOpen(true);
            setConv((p) => ({ ...p, canvas: hydrateCanvas(ev.canvas as CanvasState) }));
          }
          if (type === "plan") {
            setWorkOpen(true);
            setConv((p) => ({ ...p, plan: ev.plan as PlanState }));
          }
          if (type === "deliverable") {
            setWorkOpen(true);
            setConv((p) => ({
              ...p,
              deliverable: ev.deliverable as Conversation["deliverable"],
            }));
          }
          if (type === "image") {
            images.push(String(ev.url));
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, images: [...images] } : m,
              ),
            }));
          }
          if (type === "sources") {
            const next = (ev.sources as SearchSource[]) || [];
            sources.splice(0, sources.length, ...next);
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, sources: [...sources] } : m,
              ),
            }));
          }
          if (type === "file") {
            const file = ev.file as GeneratedFile;
            if (file?.url && !files.some((f) => f.url === file.url)) files.push(file);
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, files: [...files] } : m,
              ),
            }));
          }
          if (type === "permission") {
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      permission: {
                        ...(ev.permission as { id: string; action: string; detail: string }),
                        status: "pending",
                      },
                    }
                  : m,
              ),
            }));
          }
          if (type === "error") {
            accContent = String(ev.message || "Something went wrong.");
            setConv((p) => ({
              ...p,
              messages: p.messages.map((m) =>
                m.id === assistantId ? { ...m, content: accContent } : m,
              ),
            }));
          }
        }
      }
      if (!accContent && !sawResult) {
        accContent = EMPTY_ANALYSIS_MESSAGE;
        setConv((p) => ({
          ...p,
          messages: p.messages.map((m) =>
            m.id === assistantId ? { ...m, content: accContent } : m,
          ),
        }));
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      if (!aborted || stallTimedOut) {
        setConv((p) => ({
          ...p,
          messages: p.messages.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    m.content ||
                    (stallTimedOut ? EMPTY_ANALYSIS_MESSAGE : (e as Error).message || "Something went wrong. Please try again."),
                }
              : m,
          ),
        }));
      }
    } finally {
      if (stallTimer) window.clearTimeout(stallTimer);
      setStreaming(false);
      setStreamingId(null);
      void loadLists();
    }
  };

  const empty = conv.messages.length === 0 && !gptsOpen;
  const chips = mode === "work" ? WORK_CHIPS : CHAT_CHIPS;

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        recents={recents}
        activeId={conversationId || conv.id}
        projects={projects}
        skills={skills}
        onNew={() => newChat()}
        onSelect={(id) => {
          setGptsOpen(false);
          router.push(`/c/${id}`);
        }}
        onRename={async (id, title) => {
          await fetch(`/api/conversations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          void loadLists();
        }}
        onDelete={async (id) => {
          await fetch(`/api/conversations/${id}`, { method: "DELETE" });
          if (conversationId === id) newChat();
          void loadLists();
        }}
        onPin={async (id) => {
          const item = recents.find((r) => r.id === id);
          await fetch(`/api/conversations/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pinned: !item?.pinned }),
          });
          void loadLists();
        }}
        onSearch={() => setSearchOpen(true)}
        onGpts={() => {
          setGptsOpen(true);
          router.push("/gpts");
        }}
        onSettings={() => setSettingsOpen(true)}
        onNewProject={async () => {
          const name = prompt("Project name");
          if (!name) return;
          await fetch("/api/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
          });
          void loadLists();
        }}
        onSelectProject={(id) => newChat({ projectId: id })}
        theme={theme}
        onTheme={() => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next);
          applyTheme(next);
          localStorage.setItem("dr-theme", next);
        }}
      />

      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="relative flex h-[52px] shrink-0 items-center justify-between px-2">
            <div className="flex min-w-0 items-center">
              <ModelPicker value={model} onChange={setModel} />
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="pointer-events-auto">
                <ModeSwitcher
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setWorkOpen(m === "work");
                    setConv((p) => ({ ...p, mode: m }));
                  }}
                />
              </div>
            </div>
            <div className="relative z-10 flex items-center justify-end gap-1">
              {conv.temporary && (
                <span className="hidden items-center gap-1 rounded-full bg-[var(--bg-elev)] px-2 py-1 text-[11px] text-[var(--text-2)] sm:inline-flex">
                  <Shield size={12} /> Temporary
                </span>
              )}
              <button
                type="button"
                className="rounded-lg p-2 hover:bg-[var(--bg-hover)]"
                onClick={() => setMoreOpen((v) => !v)}
              >
                <Ellipsis size={18} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-10 z-40 w-52 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-xl">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)]"
                    onClick={() => {
                      newChat({ temporary: true });
                      setMoreOpen(false);
                    }}
                  >
                    Temporary chat
                  </button>
                </div>
              )}
            </div>
          </header>

          {gptsOpen ? (
            <GptsView
              skills={skills}
              onClose={() => {
                setGptsOpen(false);
                router.push("/");
              }}
              onStart={(skill) => {
                newChat({ skillId: skill.id });
                setTools(skill.tools || []);
              }}
            />
          ) : (
            <>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto dr-scroll">
                {empty ? (
                  <div className="flex h-full flex-col items-center justify-center px-4">
                    <h1 className="mb-8 text-center text-[32px] font-semibold tracking-[-0.03em]">
                      {mode === "work" ? "What would you like to work on?" : "What can I help with?"}
                    </h1>
                    <div className="mb-6 flex w-full justify-center">
                      <div className="w-full max-w-[768px]">
                        <Composer
                          mode={mode}
                          streaming={streaming}
                          tools={tools}
                          attachments={attachments}
                          onToolsChange={setTools}
                          onAttachments={setAttachments}
                          onVision={() => setModel("vision")}
                          onSubmit={(t) => void send(t)}
                          onStop={() => abortRef.current?.abort()}
                        />
                      </div>
                    </div>
                    <div className="flex max-w-[768px] flex-wrap justify-center gap-2">
                      {chips.map((chip) => (
                        <button
                          key={chip.label}
                          type="button"
                          className="rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
                          onClick={() => {
                            if (chip.tool) {
                              const extra = chip.tool;
                              setTools((t) => (t.includes(extra) ? t : [...t, extra]));
                              void send(chip.prompt, { extraTools: [extra] });
                            } else {
                              void send(chip.prompt);
                            }
                          }}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <MessageThread
                    messages={conv.messages}
                    streamingId={streamingId}
                    onEdit={(c) => void send(c)}
                    onPermission={(id, approved) => void send("", { permissionId: id, permissionApproved: approved })}
                  />
                )}
              </div>
              {!empty && (
                <Composer
                  mode={mode}
                  streaming={streaming}
                  disabled={streaming}
                  tools={tools}
                  attachments={attachments}
                  onToolsChange={setTools}
                  onAttachments={setAttachments}
                  onVision={() => setModel("vision")}
                  onSubmit={(t) => void send(t)}
                  onStop={() => abortRef.current?.abort()}
                />
              )}
            </>
          )}
        </div>

        {canvasOpen && conv.canvas && (
          <CanvasPanel
            canvas={conv.canvas}
            onClose={() => setCanvasOpen(false)}
            onChange={(c) => {
              setConv((p) => ({ ...p, canvas: c }));
              const id = conversationId || conv.id;
              if (!id || conv.temporary || !conv.messages.length) return;
              void fetch(`/api/conversations/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ canvas: c }),
              });
            }}
          />
        )}
        {workOpen && mode === "work" && (
          <WorkPanel
            plan={conv.plan ?? null}
            deliverable={conv.deliverable ?? null}
            onClose={() => setWorkOpen(false)}
          />
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onTheme={(t) => {
          const next = t === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : t;
          setTheme(next);
          applyTheme(next);
          localStorage.setItem("dr-theme", next);
        }}
      />
      <SearchChats
        open={searchOpen}
        recents={recents}
        onClose={() => setSearchOpen(false)}
        onSelect={(id) => router.push(`/c/${id}`)}
      />
    </div>
  );
}
