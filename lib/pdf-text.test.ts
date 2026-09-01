import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPdfTextFromBytes } from "./pdf-text.ts";

test("extracts visible text from a simple uncompressed PDF", async () => {
  const pdf = Buffer.from(
    `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R>>endobj
4 0 obj<</Length 54>>stream
BT /F1 12 Tf 20 150 Td (Hello DeepRomeo) Tj ET
endstream
endobj
trailer<</Root 1 0 R>>
%%EOF
`,
    "latin1",
  );
  const text = await extractPdfTextFromBytes(new Uint8Array(pdf));
  assert.match(text, /Hello DeepRomeo/);
});

test("a long document is not silently cut off part-way", async () => {
  const { deflateSync } = await import("node:zlib");
  const pages = 120;
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  for (let i = 1; i <= pages; i++) {
    const body = `BT /F1 10 Tf 20 700 Td (Halaman ${i} penanda unik) Tj ET\n`;
    const deflated = deflateSync(Buffer.from(body, "latin1"));
    parts.push(
      Buffer.from(`${i} 0 obj<</Length ${deflated.length}/Filter/FlateDecode>>stream\n`, "latin1"),
      deflated,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    );
  }
  parts.push(Buffer.from("trailer<</Root 1 0 R>>\n%%EOF\n", "latin1"));

  const text = await extractPdfTextFromBytes(new Uint8Array(Buffer.concat(parts)));

  // The old 40-stream ceiling dropped everything past page 40 with no warning.
  assert.match(text, /Halaman 1 /, "first page missing");
  assert.match(text, /Halaman 41 /, "stopped at the old 40-stream ceiling");
  assert.match(text, new RegExp(`Halaman ${pages} `), "last page missing");
});
