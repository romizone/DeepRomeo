"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Skill } from "@/lib/types";

export function GptsView({
  skills,
  onClose,
  onStart,
}: {
  skills: Skill[];
  onClose: () => void;
  onStart: (skill: Skill) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      skills.filter(
        (s) =>
          s.name?.toLowerCase().includes(q.toLowerCase()) ||
          s.description?.toLowerCase().includes(q.toLowerCase()),
      ),
    [skills, q],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      <header className="flex h-14 items-center justify-between px-4">
        <div className="text-[16px] font-semibold">GPTs</div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
          <X size={16} />
        </button>
      </header>
      <div className="mx-auto w-full max-w-3xl px-4 pb-10">
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search GPTs"
            className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-elev)] py-2.5 pl-9 pr-4 text-[14px] outline-none"
          />
        </div>
        <div className="mb-3 text-[13px] font-medium text-[var(--text-2)]">Featured</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStart(s)}
              className="rounded-2xl border border-[var(--border)] p-4 text-left hover:bg-[var(--bg-hover)]"
            >
              <div className="text-[15px] font-semibold">{s.name}</div>
              <div className="mt-1 text-[13px] text-[var(--text-2)]">{s.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
