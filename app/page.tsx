import { AppErrorBoundary } from "@/components/app-error-boundary";
import { AppShell } from "@/components/app-shell";

export default function Page() {
  return (
    <AppErrorBoundary>
      <AppShell />
    </AppErrorBoundary>
  );
}
