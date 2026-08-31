"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Play, X } from "lucide-react";
import type { CanvasState } from "@/lib/types";

export function CanvasPanel({
  canvas,
  onClose,
  onChange,
}: {
  canvas: CanvasState;
  onClose: () => void;
  onChange: (c: CanvasState) => void;
}) {
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const pyodideRef = useRef<unknown>(null);

  const isPy = canvas.language.toLowerCase().includes("py");

  const run = async () => {
    if (!isPy) return;
    setRunning(true);
    setOutput("");
    try {
      const res = await fetch("/api/python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: canvas.content }),
      });
      const json = (await res.json()) as { stdout?: string; stderr?: string };
      setOutput([json.stdout, json.stderr].filter(Boolean).join("\n") || "(no output)");
    } catch (e) {
      setOutput(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  void pyodideRef;

  useEffect(() => {
    setOutput("");
  }, [canvas.id]);

  const download = () => {
    const ext =
      canvas.kind === "document"
        ? "md"
        : canvas.language.replace(/[^a-z0-9]/gi, "") || "txt";
    const blob = new Blob([canvas.content], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${canvas.title}.${ext}`;
    a.click();
  };

  return (
    <section className="flex h-full min-w-[360px] max-w-[52%] flex-1 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
      <header className="flex h-12 items-center justify-between border-b border-[var(--border)] px-3">
        <input
          value={canvas.title}
          onChange={(e) => onChange({ ...canvas, title: e.target.value })}
          className="bg-transparent text-[14px] font-medium outline-none"
        />
        <div className="flex items-center gap-1">
          {isPy && (
            <button
              type="button"
              onClick={() => void run()}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] hover:bg-[var(--bg-hover)]"
            >
              <Play size={12} />
              {running ? "Running" : "Execute"}
            </button>
          )}
          <button type="button" onClick={download} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
            <Download size={16} />
          </button>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
            <X size={16} />
          </button>
        </div>
      </header>
      <textarea
        value={canvas.content}
        onChange={(e) => onChange({ ...canvas, content: e.target.value })}
        className="min-h-0 flex-1 bg-transparent p-4 font-[var(--dr-mono)] text-[13.5px] leading-6 outline-none dr-scroll"
        spellCheck={canvas.kind === "document"}
      />
      {output && (
        <pre className="max-h-40 overflow-auto border-t border-[var(--border)] bg-[var(--code-bg)] p-3 text-[12px] dr-scroll">
          {output}
        </pre>
      )}
    </section>
  );
}
