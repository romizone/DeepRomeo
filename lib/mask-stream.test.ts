import assert from "node:assert/strict";
import { test } from "node:test";
import { createStreamMasker, maskProviderText } from "./mask-stream.ts";

function streamThrough(deltas: string[]): string {
  let out = "";
  const masker = createStreamMasker((chunk) => {
    out += chunk;
  });
  for (const delta of deltas) masker.push(delta);
  masker.flush();
  return out;
}

test("a provider name split across deltas is still masked", () => {
  // The exact leak: neither half matches on its own.
  assert.equal(streamThrough(["I am ", "Deep", "Seek", ", hello."]), "I am DeepRomeo, hello.");
  assert.equal(streamThrough(["model: deep", "seek-v4-pro done"]), "model: DeepRomeo Pro done");
});

test("streamed output matches masking the whole string at once", () => {
  const source =
    "Built on DeepSeek and served via openrouter.ai using deepseek-v4-flash-vision-exp.\n" +
    "See api.deepseek.com or google/gemini-3.1-flash-image for details.";

  for (const size of [1, 2, 3, 7, 16, 64]) {
    const deltas: string[] = [];
    for (let i = 0; i < source.length; i += size) deltas.push(source.slice(i, i + size));
    assert.equal(
      streamThrough(deltas),
      maskProviderText(source),
      `chunk size ${size} diverged from whole-string masking`,
    );
  }
});

test("nothing is dropped for text with no provider names", () => {
  const source = "Halo, ini jawaban biasa.\nBaris kedua tanpa spasi_di_akhir";
  assert.equal(streamThrough(source.split("")), source);
});

test("flush releases a trailing word that never got its whitespace", () => {
  const masker = createStreamMasker(() => {});
  masker.push("trailing");
  let flushed = "";
  const second = createStreamMasker((chunk) => {
    flushed += chunk;
  });
  second.push("DeepSeek");
  assert.equal(flushed, "", "held back until flush");
  second.flush();
  assert.equal(flushed, "DeepRomeo");
});

test("an unbroken run without whitespace still drains", () => {
  const long = "x".repeat(2000);
  assert.equal(streamThrough([long]), long);
});

test("provider names are masked before any classification runs", () => {
  // maskError lives in brand.ts (server-only); this guards the shared table it
  // depends on: every pattern below must still be rewritten.
  const cases: [string, RegExp][] = [
    ["deepseek-v4-flash-vision-exp", /^DeepRomeo Vision Flash$/],
    ["deepseek-v4-pro", /^DeepRomeo Pro$/],
    ["Powered by DeepSeek", /^Powered by DeepRomeo$/],
    ["see api.deepseek.com", /^see DeepRomeo$/],
    ["google/gemini-3.1-flash-image", /^DeepRomeo Image$/],
  ];
  for (const [input, want] of cases) {
    assert.match(maskProviderText(input), want, `not masked: ${input}`);
  }
});
