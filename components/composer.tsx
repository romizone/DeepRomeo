"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Check,
  Code2,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import {
  attachmentsForChatRequest,
  clientUploadMaxBytes,
  tooLargeError,
  UPLOAD_TIMEOUT_MS,
} from "@/lib/attachments";
import { prepareLocalAttachment } from "@/lib/prepare-upload";
import { PLUGIN_CATALOG, composerToolLabel } from "@/lib/plugin-catalog";
import type { Attachment, ComposerTool, Mode } from "@/lib/types";
import { PluginIcon } from "./plugin-icons";

const MORE: { id: ComposerTool; label: string; desc: string; icon: typeof Plus }[] = [
  { id: "research", label: "Deep research", desc: "Multi-source brief", icon: BookOpen },
  { id: "canvas", label: "Canvas", desc: "Write or code on the side", icon: BookOpen },
  { id: "python", label: "Python", desc: "Calculate and analyze", icon: Code2 },
];

export function Composer({
  mode,
  disabled,
  streaming,
  tools,
  attachments,
  onToolsChange,
  onAttachments,
  onVision,
  onSubmit,
  onStop,
}: {
  mode: Mode;
  disabled?: boolean;
  streaming?: boolean;
  tools: ComposerTool[];
  attachments: Attachment[];
  onToolsChange: (tools: ComposerTool[]) => void;
  onAttachments: (files: Attachment[]) => void;
  onVision?: () => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const placeMenu = useCallback(() => {
    const panel = menuPanelRef.current;
    const rect = plusRef.current?.getBoundingClientRect();
    if (!panel || !rect) return;
    const gap = 8;
    const width = Math.min(392, Math.max(280, window.innerWidth - 24));
    const maxHeight = Math.max(240, Math.min(460, rect.top - gap - 8));
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    panel.style.left = `${left}px`;
    panel.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.width = `${width}px`;
  }, []);

  useEffect(() => {
    if (!menu) return;
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [menu, placeMenu]);

  const canSend = !uploading && (text.trim().length > 0 || attachments.length > 0);

  const toggleTool = (id: ComposerTool, close = false) => {
    onToolsChange(tools.includes(id) ? tools.filter((t) => t !== id) : [...tools, id]);
    if (close) setMenu(false);
  };

  const openFilePicker = () => {
    try {
      fileRef.current?.click();
    } catch {
      setUploadError("Tidak bisa membuka pemilih file.");
    }
  };

  const uploadViaServer = async (file: File, maxBytes: number): Promise<Attachment | null> => {
    if (file.size > maxBytes) {
      setUploadError(tooLargeError(file.name, maxBytes));
      return null;
    }
    const fd = new FormData();
    fd.append("file", file);
    const ac = new AbortController();
    const timer = window.setTimeout(() => ac.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd, signal: ac.signal });
      let json: { attachment?: Attachment; error?: string } = {};
      try {
        json = (await res.json()) as { attachment?: Attachment; error?: string };
      } catch {
        json = {};
      }
      if (!res.ok || !json.attachment) {
        setUploadError(
          json.error ||
            (res.status === 413
              ? tooLargeError(file.name, maxBytes)
              : `Gagal mengunggah ${file.name}`),
        );
        return null;
      }
      return json.attachment;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setUploadError(`Gagal mengekstrak ${file.name} (waktu habis). Coba file yang lebih kecil.`);
      } else {
        setUploadError(`Gagal mengunggah ${file.name}`);
      }
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    onVision?.();
    const maxBytes = clientUploadMaxBytes(typeof window !== "undefined" ? window.location.hostname : "");
    const next = [...attachments];
    setUploadError(null);
    try {
      for (const file of Array.from(list)) {
        setUploading(file.name);
        const local = await prepareLocalAttachment(file);
        if (local.ok) {
          next.push(local.attachment);
          if (JSON.stringify(attachmentsForChatRequest(next)).length > 3_200_000) {
            next.pop();
            setUploadError("Terlalu banyak file sekaligus. Hapus sebagian lalu unggah lagi.");
            continue;
          }
          onAttachments([...next]);
          continue;
        }
        if (local.serverFallback) {
          const uploaded = await uploadViaServer(file, maxBytes);
          if (uploaded) {
            next.push(uploaded);
            onAttachments([...next]);
          }
          continue;
        }
        setUploadError(
          !local.error || local.error === "SERVER"
            ? `Gagal mengunggah ${file.name}`
            : local.error,
        );
      }
    } catch {
      setUploadError("Gagal mengunggah file. Coba lagi.");
    } finally {
      setUploading(null);
    }
  };

  const mic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEvent) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(" ");
      setText(t);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const submit = () => {
    if (!canSend || disabled) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div className="mx-auto w-full max-w-[768px] px-3 pb-3 sm:px-4">
      {uploadError && (
        <div className="mb-2 flex items-start justify-between gap-2 rounded-2xl border border-[var(--danger)]/40 bg-[var(--bg-elev)] px-3 py-2 text-[13px] text-[var(--danger)]">
          <span>{uploadError}</span>
          <button type="button" className="shrink-0 rounded-full p-0.5 hover:bg-[var(--bg-hover)]" onClick={() => setUploadError(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      {uploading && (
        <p className="mb-2 px-1 text-[12px] text-[var(--text-3)]">Menyiapkan {uploading}…</p>
      )}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 pr-8 text-xs"
            >
              {a.kind === "image" && a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.url} alt="" className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bg)]">
                  <Paperclip size={16} />
                </div>
              )}
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full p-0.5 hover:bg-[var(--bg-hover)]"
                onClick={() => onAttachments(attachments.filter((x) => x.id !== a.id))}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {tools.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5 px-1">
          {tools.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTool(t)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-chip)] px-2.5 py-1 text-[12px] text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
            >
              {composerToolLabel(t)}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      <div
        className="relative overflow-visible rounded-[28px] bg-[var(--bg-composer)]"
        style={{ boxShadow: "var(--shadow-composer)" }}
      >
        <textarea
          ref={ta}
          value={text}
          rows={1}
          disabled={disabled}
          placeholder={mode === "work" ? "What would you like to work on?" : "Ask anything"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="block max-h-[200px] w-full bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-6 outline-none placeholder:text-[var(--text-3)]"
        />
        <div className="flex items-center justify-between gap-2 overflow-visible px-2 pb-2 pt-1">
          <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-visible">
          <div ref={menuRef} className="relative shrink-0">
            <button
              ref={plusRef}
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--plus-border)] text-[var(--text)] hover:bg-[var(--bg-hover)]"
              aria-label="Add"
              aria-expanded={menu}
            >
              <Plus size={18} />
            </button>
            {menu && (
              <div
                ref={(node) => {
                  menuPanelRef.current = node;
                  // Ref callbacks run before paint, so the panel is positioned
                  // on its very first frame.
                  if (node) placeMenu();
                }}
                className="fixed z-[80] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,.28)] dr-scroll"
              >
                <button
                  type="button"
                  className="sticky top-0 z-10 flex w-full items-center gap-3 bg-[var(--bg)] px-3 py-2.5 text-left text-[14px] hover:bg-[var(--bg-hover)]"
                  onClick={() => {
                    openFilePicker();
                    setMenu(false);
                  }}
                >
                  <Paperclip size={18} className="text-[var(--text-2)]" />
                  Add photos & files
                </button>

                <div className="px-3 pb-1 pt-2 text-[12px] text-[var(--text-3)]">Plugin</div>
                {PLUGIN_CATALOG.map((item) => {
                  const on = tools.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                        on ? "bg-[var(--bg-elev)]" : "hover:bg-[var(--bg-hover)]"
                      }`}
                      onClick={() => toggleTool(item.id)}
                    >
                      <PluginIcon name={item.icon} size={20} />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-[14px] text-[var(--text)]">{item.title}</span>
                        <span className="ml-1.5 text-[13px] font-normal text-[var(--text-3)]">
                          {item.description}
                        </span>
                      </span>
                      {on && <Check size={14} className="shrink-0 text-[var(--text-2)]" />}
                    </button>
                  );
                })}

                <div className="px-3 pb-1 pt-2 text-[12px] text-[var(--text-3)]">More</div>
                {MORE.map((item) => {
                  const on = tools.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left text-[14px] ${
                        on ? "bg-[var(--bg-elev)]" : "hover:bg-[var(--bg-hover)]"
                      }`}
                      onClick={() => toggleTool(item.id)}
                    >
                      <item.icon size={18} className="text-[var(--text-2)]" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold">{item.label}</span>
                        <span className="ml-1.5 font-normal text-[var(--text-3)]">{item.desc}</span>
                      </span>
                      {on && <Check size={14} className="shrink-0 text-[var(--text-2)]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={Boolean(uploading)}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--plus-border)] px-2.5 text-[var(--text)] hover:bg-[var(--bg-hover)] disabled:opacity-40 sm:px-3"
            aria-label="Upload file"
            title="Upload file"
          >
            <Paperclip size={18} className="shrink-0" />
            <span className="hidden text-[13px] font-medium leading-none sm:inline">Upload</span>
          </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={mic}
              className={`flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--bg-hover)] ${listening ? "text-[var(--danger)]" : "text-[var(--text-2)]"}`}
              aria-label="Voice"
            >
              <Mic size={18} />
            </button>
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--send-bg)] text-[var(--send-fg)]"
                aria-label="Stop"
              >
                <Square size={12} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSend}
                onClick={submit}
                className="flex h-9 w-9 items-center justify-center rounded-full disabled:cursor-default"
                style={{
                  background: canSend ? "var(--send-bg)" : "var(--send-off)",
                  color: canSend ? "var(--send-fg)" : "var(--send-off-fg)",
                }}
                aria-label="Send"
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 text-center text-[12px] text-[var(--text-3)]">
        DeepRomeo can make mistakes. Check important info.
      </p>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.json,.docx,.py,.js,.ts"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void pickFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
