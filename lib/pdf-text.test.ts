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
