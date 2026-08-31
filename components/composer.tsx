"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  BookOpen,
  Code2,
  Globe,
  ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import type { Attachment, ComposerTool, Mode } from "@/lib/types";

const MENU: {
  id: ComposerTool | "files";
  label: string;
  icon: typeof Plus;
  desc?: string;
}[] = [
  { id: "files", label: "Add photos & files", icon: Paperclip },
  { id: "image", label: "Create image", icon: ImageIcon },
  { id: "research", label: "Deep research", icon: BookOpen },
  { id: "search", label: "Search", icon: Globe },
  { id: "canvas", label: "Canvas", icon: BookOpen },
  { id: "python", label: "Python", icon: Code2 },
];

export function Composer({
  mode,
  disabled,
  streaming,
  tools,
  attachments,
  onToolsChange,
  onAttachments,
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
  onSubmit: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [listening, setListening] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

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

  const canSend = text.trim().length > 0 || attachments.length > 0;

  const toggleTool = (id: ComposerTool) => {
    onToolsChange(tools.includes(id) ? tools.filter((t) => t !== id) : [...tools, id]);
    setMenu(false);
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...attachments];
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const json = (await res.json()) as { attachment?: Attachment };
      if (json.attachment) next.push(json.attachment);
    }
    onAttachments(next);
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
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] p-1.5 pr-8 text-xs"
            >
              {a.kind === "image" ? (
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
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-chip)] px-2.5 py-1 text-[12px] capitalize text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
            >
              {t === "search" ? "Search" : t === "research" ? "Deep research" : t === "image" ? "Create image" : t}
              <X size={12} />
            </button>
          ))}
        </div>
      )}

      <div
        className="relative rounded-[28px] bg-[var(--bg-composer)]"
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
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--plus-border)] text-[var(--text)] hover:bg-[var(--bg-hover)]"
              aria-label="Add"
            >
              <Plus size={18} />
            </button>
            {menu && (
              <div className="absolute bottom-[44px] left-0 z-50 w-[260px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_12px_40px_rgba(0,0,0,.28)]">
                {MENU.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-[var(--bg-hover)]"
                    onClick={() => {
                      if (item.id === "files") {
                        fileRef.current?.click();
                        setMenu(false);
                      } else {
                        toggleTool(item.id);
                      }
                    }}
                  >
                    <item.icon size={18} className="text-[var(--text-2)]" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
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
        className="hidden"
        onChange={(e) => {
          void pickFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
