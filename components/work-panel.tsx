"use client";

import { Check, Circle, Loader2, X } from "lucide-react";
import { Markdown } from "./markdown";
import type { PlanState } from "@/lib/types";

export function WorkPanel({
  plan,
  deliverable,
  onClose,
}: {
  plan: PlanState | null;
  deliverable: { title: string; html?: string; markdown?: string } | null;
  onClose: () => void;
}) {
  return (
    <section className="flex h-full w-[380px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="text-[14px] font-semibold">Work</div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
          <X size={16} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 dr-scroll">
        {plan && (
          <div className="mb-6">
            <div className="mb-3 text-[13px] font-medium text-[var(--text-2)]">Plan</div>
            <div className="text-[15px] font-semibold">{plan.title}</div>
            <ol className="mt-3 space-y-2">
              {plan.steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2 text-[13.5px]">
                  <StatusIcon status={s.status} />
                  <div>
                    <div>
                      {i + 1}. {s.title}
                    </div>
                    {s.detail && <div className="text-[12px] text-[var(--text-3)]">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {deliverable && (
          <div>
            <div className="mb-3 text-[13px] font-medium text-[var(--text-2)]">Preview</div>
            <div className="mb-2 text-[15px] font-semibold">{deliverable.title}</div>
            {deliverable.html ? (
              <iframe
                title="Preview"
                className="h-[420px] w-full rounded-xl border border-[var(--border)] bg-white"
                srcDoc={deliverable.html}
              />
            ) : deliverable.markdown ? (
              <div className="rounded-xl border border-[var(--border)] p-3">
                <Markdown content={deliverable.markdown} />
              </div>
            ) : null}
          </div>
        )}
        {!plan && !deliverable && (
          <div className="text-[13px] text-[var(--text-3)]">
            Describe a job and DeepRomeo will plan, run tools, and show a reviewable result here.
          </div>
        )}
      </div>
    </section>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <Check size={16} className="mt-0.5 text-emerald-500" />;
  if (status === "running") return <Loader2 size={16} className="mt-0.5 animate-spin text-[var(--text-2)]" />;
  if (status === "blocked") return <X size={16} className="mt-0.5 text-[var(--danger)]" />;
  return <Circle size={14} className="mt-0.5 text-[var(--text-3)]" />;
}
