import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canvasShape,
  hydrateCanvas,
  isEmptyPresentation,
  normalizeSlides,
  slidesToHtml,
  slidesToMarkdown,
  toolChoiceFor,
} from "./canvas-data.ts";
import { createPdfBuffer, verifyPdfText } from "./tools/pdf.ts";
import { runPython } from "./tools/python.ts";

test("normalizeSlides fills missing bullets and aliases", () => {
  const fromEmpty = normalizeSlides([]);
  assert.equal(fromEmpty.length, 1);
  assert.ok(Array.isArray(fromEmpty[0].bullets));

  const fromSparse = normalizeSlides([{ heading: "Intro", points: ["One", "Two"] }]);
  assert.equal(fromSparse[0].title, "Intro");
  assert.deepEqual(fromSparse[0].bullets, ["One", "Two"]);

  const fromString = normalizeSlides('[{"title":"A","bullets":["b"]}]');
  assert.equal(fromString[0].title, "A");
  assert.deepEqual(fromString[0].bullets, ["b"]);
});

test("hydrateCanvas never leaves language or slides undefined", () => {
  const canvas = hydrateCanvas({
    id: "c1",
    title: "Deck",
    kind: "presentation",
    content: "",
    language: undefined as unknown as string,
    slides: [],
  });
  assert.equal(canvas.language, "slides");
  assert.ok(canvas.slides && canvas.slides.length >= 1);
  assert.ok(Array.isArray(canvas.slides[0].bullets));
  const html = slidesToHtml(canvas.title, canvas.slides);
  assert.match(html, /<!doctype html>/i);
  assert.doesNotThrow(() => slidesToMarkdown(canvas.title, canvas.slides || []));
});

test("empty placeholder deck still forces create_presentation", () => {
  const canvas = hydrateCanvas({
    id: "draft",
    title: "Presentation",
    language: "slides",
    kind: "presentation",
    content: "",
    slides: [{ id: "s1", title: "Slide 1", bullets: [] }],
  });
  assert.equal(isEmptyPresentation(canvas), true);
  const choice = toolChoiceFor(["presentations"], canvas);
  assert.deepEqual(choice, { type: "function", function: { name: "create_presentation" } });
});

test("other plugins get a first-call tool", () => {
  assert.deepEqual(toolChoiceFor(["documents"], null), {
    type: "function",
    function: { name: "create_document" },
  });
  assert.deepEqual(toolChoiceFor(["spreadsheets"], null), {
    type: "function",
    function: { name: "create_spreadsheet" },
  });
  assert.deepEqual(toolChoiceFor(["pdf"], null), {
    type: "function",
    function: { name: "create_pdf" },
  });
  assert.deepEqual(toolChoiceFor(["search"], null), {
    type: "function",
    function: { name: "web_search" },
  });
  assert.deepEqual(toolChoiceFor(["image"], null), {
    type: "function",
    function: { name: "generate_image" },
  });
  assert.deepEqual(toolChoiceFor(["research"], null), {
    type: "function",
    function: { name: "deep_research" },
  });
  assert.deepEqual(toolChoiceFor(["python"], null), {
    type: "function",
    function: { name: "python" },
  });
  assert.deepEqual(toolChoiceFor(["canvas"], null), {
    type: "function",
    function: { name: "open_canvas" },
  });
});

test("createPdfBuffer is a real PDF and verify_pdf reports on empty text", () => {
  const buf = createPdfBuffer("Hello", "Body text for the deck.");
  assert.ok(buf.subarray(0, 5).toString() === "%PDF-");
  const ok = verifyPdfText("A short excerpt with enough words to pass.", { filename: "hello.pdf" });
  assert.equal(ok.ok, true);
  const empty = verifyPdfText("");
  assert.equal(empty.ok, false);
});

test("python tool returns output and does not hang", async () => {
  const out = await runPython("print(2 + 2)");
  assert.equal(out.stdout, "4");
});

test("canvasShape leaves content alone so editing is possible", () => {
  const editing = {
    id: "c1",
    title: "Deck",
    kind: "presentation" as const,
    language: "slides",
    content: "",
    // A blank bullet is someone who just pressed Enter; a blank title is
    // someone who cleared it to retype. hydrateCanvas erases both.
    slides: [{ id: "s1", title: "", bullets: ["baris pertama", ""] }],
  };

  const shaped = canvasShape(editing);
  assert.deepEqual(shaped.slides?.[0].bullets, ["baris pertama", ""], "blank bullet must survive");
  assert.equal(shaped.slides?.[0].title, "", "cleared title must stay cleared");
  assert.equal(shaped.kind, "presentation");
  assert.equal(shaped.language, "slides");

  // Ingestion still normalizes, which is what it is for.
  const ingested = hydrateCanvas(editing);
  assert.deepEqual(ingested.slides?.[0].bullets, ["baris pertama"]);
  assert.equal(ingested.slides?.[0].title, "Slide 1");
});

test("canvasShape fills a missing kind and language", () => {
  const shaped = canvasShape({
    id: "c2",
    title: "Sheet",
    content: "a,b",
    language: "csv",
  } as never);
  assert.equal(shaped.kind, "spreadsheet");
  assert.equal(shaped.language, "csv");
});
