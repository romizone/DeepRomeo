"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";

export function AppShellRoute() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const conversationId = parts[0] === "c" ? parts[1] : undefined;
  return <AppShell conversationId={conversationId} />;
}
