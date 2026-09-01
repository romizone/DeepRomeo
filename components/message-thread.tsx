"use client";

import {
  Check,
  Copy,
  FileText,
  Pencil,
  Share,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import { LogoMark } from "./logo";
import { Markdown } from "./markdown";
import { ThinkingBlock } from "./thinking-block";
import type { Message, PermissionRequest } from "@/lib/types";

export function MessageThread({
  messages,
  streamingId,
  onEdit,
  onPermission,
}: {
  messages: Message[];
  streamingId?: string | null;
  onEdit: (content: string) => void;
  onPermission: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[768px] px-4 py-6">
      {messages.map((m, i) => (
        <div key={m.id || `m-${i}`} className="mb-6 fade-up">
          {m.role === "user" ? (
            <UserBubble message={m} onEdit={onEdit} />
          ) : m.role === "assistant" ? (
            <AssistantBlock
              message={m}
              streaming={streamingId === m.id}
              onPermission={onPermission}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function UserBubble({ message, onEdit }: { message: Message; onEdit: (c: string) => void }) {
  return (
    <div className="flex justify-end">
      <div className="group max-w-[70%]">
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {(message.attachments || []).filter(Boolean).map((a, i) =>
              a.kind === "image" && a.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id || `img-${i}`}
                  src={a.url}
                  alt={a.name || "image"}
                  className="max-h-48 rounded-2xl object-cover"
                />
              ) : (
                <div
                  key={a.id || `file-${i}`}
                  className="rounded-2xl bg-[var(--bg-user)] px-3 py-2 text-xs"
                >
                  {a.name || "file"}
                </div>
              ),
            )}
          </div>
        )}
        <div className="rounded-[22px] bg-[var(--bg-user)] px-4 py-2.5 text-[16px] leading-6 whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="mt-1 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
          <IconBtn
            label="Copy"
            onClick={() => navigator.clipboard.writeText(message.content)}
          >
            <Copy size={14} />
          </IconBtn>
          <IconBtn label="Edit" onClick={() => onEdit(message.content)}>
            <Pencil size={14} />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

function AssistantBlock({
  message,
  streaming,
  onPermission,
}: {
  message: Message;
  streaming?: boolean;
  onPermission: (id: string, approved: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const speak = () => {
    const u = new SpeechSynthesisUtterance(message.content);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  };
  return (
    <div className="flex gap-3">
      <div className="mt-1 shrink-0 text-[var(--text)]">
        <LogoMark size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <ThinkingBlock text={message.thinking || ""} ms={message.thinkingMs} streaming={streaming && !message.content} />
        {message.toolCalls?.map((t) => (
          <div
            key={t.id}
            className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 text-[12px] text-[var(--text-2)]"
          >
            <span className={t.status === "running" ? "caret-blink" : ""}>
              {t.status === "running" ? `${t.name}…` : t.name}
            </span>
          </div>
        ))}
        {message.images?.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src.slice(0, 40)}
            src={src}
            alt="Generated"
            className="mb-3 max-w-full rounded-2xl"
          />
        ))}
        {message.files && message.files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.files.map((f) => (
              <a
                key={f.url}
                href={f.url}
                download={f.name}
                className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
              >
                <FileText size={14} />
                <span className="max-w-[200px] truncate">{f.name}</span>
              </a>
            ))}
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[12px] text-[var(--text-3)]">Sources</div>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((s, i) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--text-2)] hover:bg-[var(--bg-hover)]"
                  title={s.snippet || s.url}
                >
                  <span className="text-[var(--text-3)]">{i + 1}</span>
                  <span className="truncate">{s.title}</span>
                </a>
              ))}
            </div>
          </div>
        )}
        {message.content ? (
          <div className={streaming ? "caret-blink" : ""}>
            <Markdown content={message.content} />
          </div>
        ) : streaming ? (
          <div className="text-[var(--text-2)] caret-blink">Thinking</div>
        ) : null}
        {message.permission && (
          <PermissionCard perm={message.permission} onPermission={onPermission} />
        )}
        {!streaming && message.content && (
          <div className="mt-2 flex gap-0.5 text-[var(--text-2)]">
            <IconBtn
              label="Copy"
              onClick={async () => {
                await navigator.clipboard.writeText(message.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </IconBtn>
            <IconBtn label="Good">
              <ThumbsUp size={15} />
            </IconBtn>
            <IconBtn label="Bad">
              <ThumbsDown size={15} />
            </IconBtn>
            <IconBtn label="Read aloud" onClick={speak}>
              <Volume2 size={15} />
            </IconBtn>
            <IconBtn label="Share">
              <Share size={15} />
            </IconBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function PermissionCard({
  perm,
  onPermission,
}: {
  perm: PermissionRequest;
  onPermission: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-[var(--border)] p-4">
      <div className="text-[14px] font-medium">Allow this action?</div>
      <div className="mt-1 text-[13px] text-[var(--text-2)]">
        <div className="font-medium text-[var(--text)]">{perm.action}</div>
        {perm.detail}
      </div>
      {perm.status === "pending" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onPermission(perm.id, true)}
            className="rounded-full bg-[var(--send-bg)] px-4 py-1.5 text-[13px] font-medium text-[var(--send-fg)]"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => onPermission(perm.id, false)}
            className="rounded-full border border-[var(--border)] px-4 py-1.5 text-[13px]"
          >
            Decline
          </button>
        </div>
      ) : (
        <div className="mt-2 text-[12px] text-[var(--text-3)] capitalize">{perm.status}</div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]"
    >
      {children}
    </button>
  );
}
