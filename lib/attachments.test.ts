import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXTRACT_CHARS_PER_FILE,
  EXTRACT_CHARS_TOTAL,
  TRUNCATION_MARK,
  attachmentsForChatRequest,
  buildProviderUserText,
  capToolArguments,
  persistableAttachment,
  persistableMessage,
  sanitizeAttachments,
  tooLargeError,
  truncateExtractedText,
} from "./attachments.ts";

test("truncates per file and marks [truncated]", () => {
  // Sized off the constant so raising the budget cannot quietly void the test.
  const out = truncateExtractedText("A".repeat(EXTRACT_CHARS_PER_FILE * 2));
  assert.ok(out.length <= EXTRACT_CHARS_PER_FILE);
  assert.ok(out.endsWith(TRUNCATION_MARK));
});

test("three large PDF texts still fit in the chat message builder", () => {
  // Each file must overshoot the per-file budget for truncation to be exercised.
  const perFileOvershoot = Math.ceil((EXTRACT_CHARS_PER_FILE * 1.5) / 12);
  const attachments = [1, 2, 3].map((i) => ({
    id: `id-${i}`,
    name: `paper-${i}.pdf`,
    mime: "application/pdf",
    size: 6_000_000,
    url: "data:application/pdf;base64,AAAA",
    kind: "file" as const,
    text: `PDF ${i} body `.repeat(perFileOvershoot),
  }));

  const sanitized = sanitizeAttachments(attachments);
  assert.equal(sanitized.length, 3);
  const total = sanitized.reduce((n, a) => n + (a.text?.length || 0), 0);
  assert.ok(total <= EXTRACT_CHARS_TOTAL);
  for (const a of sanitized) {
    assert.ok(a.text?.includes(TRUNCATION_MARK));
  assert.equal(a.url, "");
  }

  const kept = sanitizeAttachments([
    {
      id: "img-1",
      name: "shot.png",
      mime: "image/png",
      size: 12_000,
      url: "/api/files/abc.png",
      kind: "image",
    },
  ]);
  assert.equal(kept[0].url, "/api/files/abc.png");

  const photo = sanitizeAttachments([
    {
      id: "img-2",
      name: "photo.jpg",
      mime: "image/jpeg",
      size: 80_000,
      url: `data:image/jpeg;base64,${"A".repeat(120_000)}`,
      kind: "image",
    },
  ]);
  assert.match(photo[0].url, /^data:image\/jpeg/);

  const payload = attachmentsForChatRequest(attachments);
  const json = JSON.stringify({ message: "analisis", attachments: payload });
  assert.ok(
    json.length < EXTRACT_CHARS_TOTAL + 40_000,
    `payload ${json.length} should track the text budget and stay far under Vercel 4.5MB`,
  );

  const user = buildProviderUserText("analisis", attachments);
  assert.match(user, /^analisis/);
  assert.ok(user.includes("[File: paper-1.pdf]"));
  assert.ok(user.includes("[File: paper-2.pdf]"));
  assert.ok(user.includes("[File: paper-3.pdf]"));
  assert.ok(user.includes(TRUNCATION_MARK));
  assert.ok(user.length < EXTRACT_CHARS_TOTAL + 200);
});

test("size error uses Indonesian PDF copy", () => {
  assert.equal(tooLargeError("big.pdf", 4 * 1024 * 1024), "PDF terlalu besar (maks. 4 MB)");
  assert.equal(tooLargeError("notes.txt", 4 * 1024 * 1024), "File terlalu besar (maks. 4 MB)");
});

test("caps verify_pdf / read_pdf tool echo without touching other tools", () => {
  const huge = JSON.stringify({ text: "X".repeat(20_000), filename: "a.pdf" });
  const capped = capToolArguments("verify_pdf", huge);
  assert.ok(capped.length < 4000);
  assert.ok(capped.includes(TRUNCATION_MARK));
  assert.equal(capToolArguments("create_document", huge), huge);
});

test("persistable attachments drop data URLs so chat history stays small", () => {
  const persisted = persistableAttachment({
    id: "img-3",
    name: "photo.jpg",
    mime: "image/jpeg",
    size: 80_000,
    url: `data:image/jpeg;base64,${"A".repeat(120_000)}`,
    kind: "image",
  });
  assert.equal(persisted.url, "");
  assert.equal(persisted.name, "photo.jpg");
});

test("generated media is never persisted as an inlined blob", () => {
  const bigImage = `data:image/png;base64,${"A".repeat(900_000)}`;
  const message = persistableMessage({
    id: "a1",
    role: "assistant",
    content: "here you go",
    images: [bigImage, "/api/files/kept.png"],
    files: [
      { name: "big.pdf", url: `data:application/pdf;base64,${"B".repeat(900_000)}`, mime: "application/pdf" },
      { name: "ok.pdf", url: "/api/files/ok.pdf", mime: "application/pdf" },
    ],
    canvas: {
      id: "c1",
      title: "Doc",
      language: "pdf",
      kind: "pdf",
      content: "body",
      fileUrl: `data:application/pdf;base64,${"C".repeat(900_000)}`,
    },
    createdAt: 1,
  });

  assert.deepEqual(message.images, ["/api/files/kept.png"]);
  assert.deepEqual(
    message.files?.map((f) => f.url),
    ["/api/files/ok.pdf"],
  );
  assert.equal(message.canvas?.fileUrl, undefined);

  // Whatever survives has to fit alongside a chat thread in localStorage.
  assert.ok(JSON.stringify(message).length < 4_000, "persisted message stays small");
});

test("short data URLs and plain URLs pass through untouched", () => {
  const tiny = "data:image/png;base64,AAAA";
  const message = persistableMessage({
    id: "a2",
    role: "assistant",
    content: "",
    images: [tiny],
    files: [{ name: "n.csv", url: "/api/files/n.csv", mime: "text/csv" }],
    createdAt: 1,
  });
  assert.deepEqual(message.images, [tiny]);
  assert.equal(message.files?.[0].url, "/api/files/n.csv");
});
