"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Conversation } from "@/lib/types";

export function SearchChats({
  open,
  recents,
  onClose,
  onSelect,
}: {
  open: boolean;
  recents: Conversation[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const items = useMemo(
    () => recents.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())),
    [recents, q],
  );
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-[var(--overlay)] pt-[12vh]">
      <div className="w-full max-w-[640px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
          <Search size={16} className="text-[var(--text-3)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chats…"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none"
          />
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2 dr-scroll">
          {items.length === 0 && (
            <div className="px-3 py-8 text-center text-[13px] text-[var(--text-3)]">No chats found</div>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.id);
                onClose();
              }}
              className="flex w-full rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-[var(--bg-hover)]"
            >
              {c.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
