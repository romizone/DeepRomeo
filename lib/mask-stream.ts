/**
 * Provider-name masking. Kept free of "server-only" so it stays unit-testable;
 * lib/brand.ts re-exports these for the server code paths.
 */

/**
 * Order matters: the first pattern that matches wins, so every specific form
 * has to precede the catch-all. `api.deepseek.com` used to sit after
 * /deepseek[\w.-]*​/ and never fired, leaving a stray "api." behind.
 */
const REPLACEMENTS: [RegExp, string][] = [
  [/(?:https?:\/\/)?api\.deepseek\.com(?:\/[\w./=&?%-]*)?/gi, "DeepRomeo"],
  [/deepseek-v4-flash-vision-exp/gi, "DeepRomeo Vision Flash"],
  [/deepseek-v4-flash/gi, "DeepRomeo Flash"],
  [/deepseek-v4-pro/gi, "DeepRomeo Pro"],
  [/google\/gemini-[\w.-]+/gi, "DeepRomeo Image"],
  [/(?:https?:\/\/)?openrouter\.ai(?:\/[\w./=&?%-]*)?/gi, "DeepRomeo"],
  [/OpenRouter/gi, "DeepRomeo"],
  [/deepseek[\w.-]*/gi, "DeepRomeo"],
  [/DeepSeek/g, "DeepRomeo"],
];

export function maskProviderText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  // Earlier rules deleted their match outright, which left doubled spaces and
  // orphaned punctuation mid-sentence.
  return out.replace(/[ \t]{2,}/g, " ");
}

/**
 * Masking a streamed response one delta at a time misses any pattern that
 * straddles a chunk boundary ("Deep" + "Seek" matches neither half). This
 * buffers the trailing partial word and only releases text up to the last
 * whitespace, which no provider token can span.
 */
const HARD_FLUSH_CHARS = 512;
const CARRY_CHARS = 64;

export function createStreamMasker(emit: (chunk: string) => void) {
  let pending = "";

  const release = (upto: number) => {
    const safe = pending.slice(0, upto);
    pending = pending.slice(upto);
    if (safe) emit(maskProviderText(safe));
  };

  return {
    push(delta: string) {
      if (!delta) return;
      pending += delta;
      const cut = Math.max(pending.lastIndexOf(" "), pending.lastIndexOf("\n"));
      if (cut >= 0) {
        release(cut + 1);
        return;
      }
      // No whitespace to break on (long URL, base64). Flush all but a carry
      // window wide enough to hold any masked pattern.
      if (pending.length >= HARD_FLUSH_CHARS) release(pending.length - CARRY_CHARS);
    },
    flush() {
      release(pending.length);
    },
  };
}
