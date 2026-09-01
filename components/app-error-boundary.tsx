"use client";

import { Component, type ReactNode } from "react";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg,#212121)] px-6 text-center text-[var(--text,#ececec)]">
          <p className="text-[18px] font-semibold">DeepRomeo hit a display error</p>
          <p className="max-w-md text-[14px] text-[var(--text-2,#b4b4b4)]">
            The chat shell is still here. Reload to continue — your last message may need to be sent again.
          </p>
          <button
            type="button"
            className="mt-2 rounded-full bg-white px-4 py-2 text-[13px] font-medium text-black"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
