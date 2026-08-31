"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MODELS, type ModelId } from "@/lib/types";

export function ModelPicker({
  value,
  onChange,
}: {
  value: ModelId;
  onChange: (id: ModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODELS.find((m) => m.id === value) || MODELS[0];

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[16px] font-semibold tracking-[-0.02em] hover:bg-[var(--bg-hover)]"
      >
          <span className="hidden sm:inline">{current.name}</span>
          <span className="sm:hidden">{current.tag}</span>
        <ChevronDown size={16} className="text-[var(--text-2)]" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-[0_8px_40px_rgba(0,0,0,.22)]">
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-[var(--bg-hover)]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[14px] font-medium">
                  {m.name}
                  <span className="rounded-full bg-[var(--bg-elev)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-2)]">
                    {m.tag}
                  </span>
                </div>
                <div className="mt-0.5 text-[12.5px] text-[var(--text-2)]">{m.description}</div>
              </div>
              {value === m.id && <Check size={16} className="mt-1 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
