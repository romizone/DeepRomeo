import type { ReactNode } from "react";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { AppShellRoute } from "@/components/app-shell-route";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <AppErrorBoundary>
      <AppShellRoute />
      {children}
    </AppErrorBoundary>
  );
}
