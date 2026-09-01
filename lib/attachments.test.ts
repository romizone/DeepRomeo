import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXTRACT_CHARS_PER_FILE,
  EXTRACT_CHARS_TOTAL,
  TRUNCATION_MARK,
  attachmentsForChatRequest,
  buildProviderUserText,
  capToolArguments,
  sanitizeAttachments,
  tooLargeError,
  truncateExtractedText,
} from "./attachments.ts";

test("truncates per file and marks [truncated]", () => {
  const out = truncateExtractedText("A".repeat(80_000));
  assert.ok(out.length <= EXTRACT_CHARS_PER_FILE);
  assert.ok(out.endsWith(TRUNCATION_MARK));
});

test("three large PDF texts still fit in the chat message builder", () => {
  const attachments = [1, 2, 3].map((i) => ({
    id: `id-${i}`,
    name: `paper-${i}.pdf`,
    mime: "application/pdf",
    size: 6_000_000,
    url: "data:application/pdf;base64,AAAA",
    kind: "file" as const,
    text: `PDF ${i} body `.repeat(10_000),
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

  const payload = attachmentsForChatRequest(attachments);
  const json = JSON.stringify({ message: "analisis", attachments: payload });
  assert.ok(json.length < 160_000, `payload ${json.length} should stay well under Vercel 4.5MB`);

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
