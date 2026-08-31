"use client";

import type { Mode } from "@/lib/types";

export function ModeSwitcher({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-[var(--switch-track)] p-[3px]">
      {(["chat", "work"] as const).map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`min-w-[72px] rounded-full px-4 py-[6px] text-[13px] font-medium capitalize transition ${
              active
                ? "bg-[var(--switch-active)] text-[var(--text)] shadow-[0_1px_2px_rgba(0,0,0,.12)]"
                : "text-[var(--text-2)] hover:text-[var(--text)]"
            }`}
          >
            {mode === "chat" ? "Chat" : "Work"}
          </button>
        );
      })}
    </div>
  );
}
