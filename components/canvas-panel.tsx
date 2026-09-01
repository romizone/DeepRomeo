"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, Play, Plus, Trash2, X } from "lucide-react";
import { canvasShape, slidesToHtml } from "@/lib/canvas-data";
import type { CanvasState, Slide, SpreadsheetData } from "@/lib/types";
import { Markdown } from "./markdown";

export function CanvasPanel({
  canvas: incoming,
  onClose,
  onChange,
}: {
  canvas: CanvasState;
  onClose: () => void;
  onChange: (c: CanvasState) => void;
}) {
  // Shape only: re-normalizing here would fight the person typing.
  const canvas = canvasShape(incoming);
  const [output, setOutput] = useState("");
  const [running, setRunning] = useState(false);
  const [docMode, setDocMode] = useState<"edit" | "preview">("preview");

  const isPy = (canvas.language || "").toLowerCase().includes("py");

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

  const download = () => {
    if (canvas.kind === "pdf" && canvas.fileUrl) {
      const a = document.createElement("a");
      a.href = canvas.fileUrl;
      a.download = canvas.fileName || `${canvas.title}.pdf`;
      a.click();
      return;
    }
    let filename = `${canvas.title}.txt`;
    let type = "text/plain";
    let body = canvas.content;
    if (canvas.kind === "document") {
      filename = `${canvas.title}.md`;
    } else if (canvas.kind === "spreadsheet") {
      filename = `${canvas.title}.csv`;
      type = "text/csv";
      body = canvas.content;
    } else if (canvas.kind === "presentation") {
      filename = `${canvas.title}.html`;
      type = "text/html";
      body = slidesToHtml(canvas.title, canvas.slides || []);
    } else {
      const ext = (canvas.language || "txt").replace(/[^a-z0-9]/gi, "") || "txt";
      filename = `${canvas.title}.${ext}`;
    }
    const blob = new Blob([body], { type });
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = filename;
    a.click();
    // Without this the blob is pinned for the lifetime of the document.
    setTimeout(() => URL.revokeObjectURL(href), 0);
  };

  return (
    <section className="flex h-full min-w-[360px] max-w-[52%] flex-1 flex-col border-l border-[var(--border)] bg-[var(--bg)]">
      <header className="flex h-12 items-center justify-between gap-2 border-b border-[var(--border)] px-3">
        <input
          value={canvas.title || ""}
          onChange={(e) => onChange({ ...canvas, title: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none"
        />
        <div className="flex shrink-0 items-center gap-1">
          {canvas.kind === "document" && (
            <div className="mr-1 flex rounded-full border border-[var(--border)] p-0.5 text-[11px]">
              <button
                type="button"
                className={`rounded-full px-2 py-0.5 ${docMode === "edit" ? "bg-[var(--bg-hover)]" : ""}`}
                onClick={() => setDocMode("edit")}
              >
                Edit
              </button>
              <button
                type="button"
                className={`rounded-full px-2 py-0.5 ${docMode === "preview" ? "bg-[var(--bg-hover)]" : ""}`}
                onClick={() => setDocMode("preview")}
              >
                Preview
              </button>
            </div>
          )}
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

      {canvas.kind === "presentation" ? (
        <PresentationView canvas={canvas} onChange={onChange} />
      ) : canvas.kind === "spreadsheet" ? (
        <SpreadsheetView canvas={canvas} onChange={onChange} />
      ) : canvas.kind === "pdf" ? (
        <PdfView canvas={canvas} />
      ) : canvas.kind === "document" && docMode === "preview" ? (
        <div className="min-h-0 flex-1 overflow-auto p-5 dr-scroll">
          <Markdown content={canvas.content || "_Empty document_"} />
        </div>
      ) : (
        <textarea
          value={canvas.content || ""}
          onChange={(e) => onChange({ ...canvas, content: e.target.value })}
          className="min-h-0 flex-1 bg-transparent p-4 font-[var(--dr-mono)] text-[13.5px] leading-6 outline-none dr-scroll"
          spellCheck={canvas.kind === "document"}
        />
      )}

      {output && (
        <pre className="max-h-40 overflow-auto border-t border-[var(--border)] bg-[var(--code-bg)] p-3 text-[12px] dr-scroll">
          {output}
        </pre>
      )}
    </section>
  );
}

function PresentationView({
  canvas,
  onChange,
}: {
  canvas: CanvasState;
  onChange: (c: CanvasState) => void;
}) {
  const slides = (canvas.slides?.length ? canvas.slides : [{ id: "s1", title: canvas.title || "Slide", bullets: [] }]).map(
    (s, i) => ({
      // `?? ""` not `|| "Slide"`: a title cleared for retyping must stay clear.
      // A generated id would also change on every render and churn React keys.
      id: s?.id || `slide-${i}`,
      title: s?.title ?? "",
      bullets: Array.isArray(s?.bullets) ? s.bullets : [],
      notes: s?.notes,
    }),
  );
  const [index, setIndex] = useState(0);
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, slides.length - 1)));
  const slide = slides[safeIndex] || slides[0] || { id: "s1", title: "Slide", bullets: [] as string[] };

  const updateSlide = (next: Slide) => {
    const slidesNext = slides.map((s, i) => (i === safeIndex ? next : s));
    onChange({ ...canvas, slides: slidesNext });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 py-2 text-[12px] text-[var(--text-2)]">
        <button
          type="button"
          className="rounded-lg p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
          disabled={safeIndex <= 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft size={16} />
        </button>
        <span>
          Slide {safeIndex + 1} / {slides.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-lg p-1 hover:bg-[var(--bg-hover)]"
            onClick={() => {
              const next = {
                id: crypto.randomUUID(),
                title: "New slide",
                bullets: ["Point"],
              };
              onChange({ ...canvas, slides: [...slides, next] });
              setIndex(slides.length);
            }}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className="rounded-lg p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
            disabled={slides.length <= 1}
            onClick={() => {
              const next = slides.filter((_, i) => i !== safeIndex);
              onChange({ ...canvas, slides: next });
              setIndex((i) => Math.max(0, i - 1));
            }}
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            className="rounded-lg p-1 hover:bg-[var(--bg-hover)] disabled:opacity-40"
            disabled={safeIndex >= slides.length - 1}
            onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3 dr-scroll">
        <div className="aspect-video rounded-xl bg-white px-8 py-7 text-[#111] shadow-[0_8px_30px_rgba(0,0,0,.18)]">
          <input
            value={slide.title || ""}
            onChange={(e) => updateSlide({ ...slide, id: slide.id || "s1", title: e.target.value, bullets: slide.bullets || [] })}
            placeholder="Judul slide"
            className="w-full bg-transparent text-[26px] font-semibold tracking-[-0.03em] outline-none"
          />
          <textarea
            value={(slide.bullets || []).join("\n")}
            onChange={(e) =>
              updateSlide({
                ...slide,
                id: slide.id || "s1",
                title: slide.title ?? "",
                bullets: e.target.value.split("\n"),
              })
            }
            className="mt-4 h-[calc(100%-64px)] w-full resize-none bg-transparent text-[16px] leading-7 outline-none"
            placeholder={"Bullet one\nBullet two"}
          />
        </div>
      </div>
    </div>
  );
}

function SpreadsheetView({
  canvas,
  onChange,
}: {
  canvas: CanvasState;
  onChange: (c: CanvasState) => void;
}) {
  const headers = canvas.sheet?.headers?.length ? canvas.sheet.headers : ["Column 1"];
  const sheet: SpreadsheetData = {
    headers,
    rows: (canvas.sheet?.rows?.length ? canvas.sheet.rows : [[""]]).map((row) =>
      headers.map((_, i) => row?.[i] || ""),
    ),
  };

  const commit = (next: SpreadsheetData) => {
    const csv = [next.headers, ...next.rows]
      .map((row) => row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
      .join("\n");
    onChange({ ...canvas, sheet: next, content: csv + "\n" });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto p-3 dr-scroll">
      <table className="min-w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-8 border border-[var(--border)] bg-[var(--bg-elev)] px-1 text-[11px] text-[var(--text-3)]" />
            {sheet.headers.map((h, i) => (
              <th key={i} className="border border-[var(--border)] bg-[var(--bg-elev)] p-0">
                <input
                  value={h}
                  onChange={(e) => {
                    const headers = sheet.headers.map((x, idx) => (idx === i ? e.target.value : x));
                    commit({ ...sheet, headers });
                  }}
                  className="w-full min-w-[88px] bg-transparent px-2 py-1.5 font-semibold outline-none"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheet.rows.map((row, r) => (
            <tr key={r}>
              <td className="border border-[var(--border)] bg-[var(--bg-elev)] px-1 text-center text-[11px] text-[var(--text-3)]">
                {r + 1}
              </td>
              {sheet.headers.map((_, c) => (
                <td key={c} className="border border-[var(--border)] p-0">
                  <input
                    value={row[c] || ""}
                    onChange={(e) => {
                      const rows = sheet.rows.map((line, idx) =>
                        idx === r ? line.map((cell, ci) => (ci === c ? e.target.value : cell)) : line,
                      );
                      commit({ ...sheet, rows });
                    }}
                    className="w-full min-w-[88px] bg-transparent px-2 py-1.5 outline-none"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] hover:bg-[var(--bg-hover)]"
          onClick={() =>
            commit({
              ...sheet,
              rows: [...sheet.rows, sheet.headers.map(() => "")],
            })
          }
        >
          Add row
        </button>
        <button
          type="button"
          className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[12px] hover:bg-[var(--bg-hover)]"
          onClick={() =>
            commit({
              headers: [...sheet.headers, `Column ${sheet.headers.length + 1}`],
              rows: sheet.rows.map((row) => [...row, ""]),
            })
          }
        >
          Add column
        </button>
      </div>
    </div>
  );
}

function PdfView({ canvas }: { canvas: CanvasState }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canvas.fileUrl ? (
        <iframe title={canvas.title} src={canvas.fileUrl} className="min-h-0 flex-1 bg-white" />
      ) : (
        <div className="p-4 text-[13px] text-[var(--text-3)]">No PDF file yet.</div>
      )}
      {canvas.content && (
        <details className="border-t border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-2)]">
          <summary className="cursor-pointer">Source text</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-[var(--dr-mono)] dr-scroll">
            {canvas.content}
          </pre>
        </details>
      )}
    </div>
  );
}
