"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

export function ThinkingBlock({
  text,
  ms,
  streaming,
}: {
  text: string;
  ms?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const secs = Math.max(1, Math.round((ms || 0) / 1000));
  const label = streaming ? "Thinking" : `Thought for ${secs}s`;
  if (!text && !streaming) return null;
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[13px] text-[var(--text-2)] hover:text-[var(--text)]"
      >
        <ChevronRight
          size={14}
          className={`transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className={streaming ? "caret-blink" : ""}>{label}</span>
      </button>
      {open && text && (
        <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2 text-[13px] leading-6 text-[var(--text-2)] dr-scroll whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}
