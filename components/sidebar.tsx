"use client";

import { useMemo, useState } from "react";
import {
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from "lucide-react";
import { LogoMark, Wordmark } from "./logo";
import type { Conversation, Project, Skill } from "@/lib/types";

function groupLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  // Rounding to whole days keeps this correct across DST, where the gap
  // between two midnights is 23 or 25 hours rather than exactly 86400000ms.
  const days = Math.round((start(now) - start(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return d.toLocaleString("en", { month: "long" });
}

export function Sidebar({
  open,
  onToggle,
  recents,
  activeId,
  projects,
  skills,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onPin,
  onSearch,
  onGpts,
  onSettings,
  onNewProject,
  onSelectProject,
  theme,
  onTheme,
}: {
  open: boolean;
  onToggle: () => void;
  recents: Conversation[];
  activeId?: string | null;
  projects: Project[];
  skills: Skill[];
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onSearch: () => void;
  onGpts: () => void;
  onSettings: () => void;
  onNewProject: () => void;
  onSelectProject: (id: string) => void;
  theme: "light" | "dark";
  onTheme: () => void;
}) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const groups = useMemo(() => {
    const pinned = recents.filter((c) => c.pinned);
    const rest = recents.filter((c) => !c.pinned);
    const map = new Map<string, Conversation[]>();
    for (const c of rest) {
      const g = groupLabel(c.updatedAt);
      map.set(g, [...(map.get(g) || []), c]);
    }
    return { pinned, map };
  }, [recents]);

  if (!open) {
    return (
      <div className="flex h-full w-[52px] flex-col items-center gap-1 bg-[var(--bg-sidebar)] py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)]"
          aria-label="Open sidebar"
        >
          <PanelLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)]"
          aria-label="New chat"
        >
          <SquarePen size={18} />
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)]"
          aria-label="Search"
        >
          <Search size={18} />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[var(--sidebar)] shrink-0 flex-col bg-[var(--bg-sidebar)]">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)]"
          aria-label="Close sidebar"
        >
          <PanelLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--bg-hover)]"
          aria-label="New chat"
        >
          <SquarePen size={18} />
        </button>
      </div>

      <div className="px-2">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] hover:bg-[var(--bg-hover)]"
        >
          <LogoMark size={20} />
          <Wordmark />
        </button>
        <button
          type="button"
          onClick={onSearch}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] text-[var(--text)] hover:bg-[var(--bg-hover)]"
        >
          <Search size={18} />
          Search chats
        </button>
        <button
          type="button"
          onClick={onGpts}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[14px] hover:bg-[var(--bg-hover)]"
        >
          <span className="grid h-[18px] w-[18px] place-items-center text-[13px]">▦</span>
          GPTs
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2 dr-scroll">
        <div className="mb-2 flex items-center justify-between px-2 text-[12px] font-medium text-[var(--text-3)]">
          Projects
          <button type="button" onClick={onNewProject} className="rounded p-0.5 hover:bg-[var(--bg-hover)]">
            <Plus size={14} />
          </button>
        </div>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectProject(p.id)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-[var(--bg-hover)]"
          >
            <span className="text-[var(--text-3)]">#</span>
            <span className="truncate">{p.name}</span>
          </button>
        ))}

        {groups.pinned.length > 0 && (
          <>
            <div className="mt-4 px-2 text-[12px] font-medium text-[var(--text-3)]">Pinned</div>
            {groups.pinned.map((c) => (
              <ChatRow
                key={c.id}
                c={c}
                active={c.id === activeId}
                menuId={menuId}
                setMenuId={setMenuId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onPin={onPin}
              />
            ))}
          </>
        )}

        {[...groups.map.entries()].map(([label, items]) => (
          <div key={label}>
            <div className="mt-4 px-2 text-[12px] font-medium text-[var(--text-3)]">{label}</div>
            {items.map((c) => (
              <ChatRow
                key={c.id}
                c={c}
                active={c.id === activeId}
                menuId={menuId}
                setMenuId={setMenuId}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                onPin={onPin}
              />
            ))}
          </div>
        ))}

        {skills.filter((s) => s.builtin).length > 0 && (
          <div className="mt-6 px-2 text-[12px] font-medium text-[var(--text-3)]">GPTs</div>
        )}
        {skills
          .filter((s) => s.builtin)
          .slice(0, 6)
          .map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={onGpts}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-[var(--bg-hover)]"
            >
              <span className="truncate">{s.name}</span>
            </button>
          ))}
      </div>

      <div className="border-t border-[var(--border)] p-2">
        <button
          type="button"
          onClick={onSettings}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--bg-hover)]"
        >
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[var(--bg-elev)] text-[12px] font-semibold">
            U
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[14px]">User</div>
            <div className="text-[12px] text-[var(--text-3)]">Plus</div>
          </div>
          <Settings size={16} className="text-[var(--text-3)]" />
        </button>
        <button
          type="button"
          onClick={onTheme}
          className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-[12px] text-[var(--text-3)] hover:bg-[var(--bg-hover)]"
        >
          Appearance: {theme === "dark" ? "Dark" : "Light"}
        </button>
      </div>
    </aside>
  );
}

function ChatRow({
  c,
  active,
  menuId,
  setMenuId,
  onSelect,
  onRename,
  onDelete,
  onPin,
}: {
  c: Conversation;
  active: boolean;
  menuId: string | null;
  setMenuId: (id: string | null) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(c.id)}
        className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[13.5px] ${
          active ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]"
        }`}
      >
        <span className="truncate pr-6">{c.title}</span>
      </button>
      <button
        type="button"
        className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 hover:bg-[var(--bg-elev)] group-hover:block"
        onClick={(e) => {
          e.stopPropagation();
          setMenuId(menuId === c.id ? null : c.id);
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      {menuId === c.id && (
        <div className="absolute right-1 top-8 z-40 w-40 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1 shadow-xl">
          <MenuItem
            icon={Pencil}
            label="Rename"
            onClick={() => {
              const t = prompt("Rename", c.title);
              if (t) onRename(c.id, t);
              setMenuId(null);
            }}
          />
          <MenuItem
            icon={Pin}
            label={c.pinned ? "Unpin" : "Pin"}
            onClick={() => {
              onPin(c.id);
              setMenuId(null);
            }}
          />
          <MenuItem
            icon={Trash2}
            label="Delete"
            danger
            onClick={() => {
              onDelete(c.id);
              setMenuId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Trash2;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)] ${danger ? "text-[var(--danger)]" : ""}`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
