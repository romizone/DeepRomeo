import { persistableConversation } from "./attachments";
import { hydrateCanvas } from "./canvas-data";
import type { Conversation } from "./types";

const INDEX_KEY = "dr-conv-index";

function convKey(id: string) {
  return `dr-conv:${id}`;
}

export type RecentMeta = {
  id: string;
  title: string;
  mode: Conversation["mode"];
  model: Conversation["model"];
  pinned?: boolean;
  updatedAt: number;
  createdAt: number;
};

function readIndex(): RecentMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? (JSON.parse(raw) as RecentMeta[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id) : [];
  } catch {
    return [];
  }
}

function writeIndex(items: RecentMeta[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(items.slice(0, 80)));
}

export function readClientConversation(id?: string | null): Conversation | null {
  if (!id || typeof window === "undefined") return null;
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(convKey(id));
      if (!raw) continue;
      const conv = JSON.parse(raw) as Conversation;
      if (!conv?.id) continue;
      return {
        ...conv,
        messages: Array.isArray(conv.messages) ? conv.messages : [],
        canvas: conv.canvas ? hydrateCanvas(conv.canvas) : null,
      };
    } catch {
      /* try the next store */
    }
  }
  return null;
}

export function persistClientConversation(conv: Conversation) {
  if (typeof window === "undefined" || !conv.id || conv.temporary) return;
  const slim = persistableConversation(conv);
  const payload = JSON.stringify(slim);
  try {
    sessionStorage.setItem(convKey(conv.id), payload);
  } catch {
    /* quota */
  }
  try {
    localStorage.setItem(convKey(conv.id), payload);
    const meta: RecentMeta = {
      id: slim.id,
      title: slim.title || "New chat",
      mode: slim.mode || "chat",
      model: slim.model || "flash",
      pinned: slim.pinned,
      updatedAt: slim.updatedAt,
      createdAt: slim.createdAt,
    };
    writeIndex([meta, ...readIndex().filter((item) => item.id !== meta.id)]);
  } catch {
    /* quota */
  }
}

export function listClientRecents(): RecentMeta[] {
  return readIndex();
}

export function removeClientConversation(id: string) {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(convKey(id));
  localStorage.removeItem(convKey(id));
  writeIndex(readIndex().filter((item) => item.id !== id));
}

export function mergeRecents(api: RecentMeta[], local: RecentMeta[]): RecentMeta[] {
  const map = new Map<string, RecentMeta>();
  for (const item of local) map.set(item.id, item);
  for (const item of api) {
    const prev = map.get(item.id);
    if (!prev || (item.updatedAt || 0) >= (prev.updatedAt || 0)) map.set(item.id, { ...prev, ...item });
  }
  return [...map.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
