/**
 * Provider-name masking. Kept free of "server-only" so it stays unit-testable;
 * lib/brand.ts re-exports these for the server code paths.
 */

const REPLACEMENTS: [RegExp, string][] = [
  [/deepseek-v4-flash-vision-exp/gi, "DeepRomeo Vision Flash"],
  [/deepseek-v4-flash/gi, "DeepRomeo Flash"],
  [/deepseek-v4-pro/gi, "DeepRomeo Pro"],
  [/deepseek[\w.-]*/gi, "DeepRomeo"],
  [/DeepSeek/g, "DeepRomeo"],
  [/openrouter\.ai/gi, ""],
  [/OpenRouter/gi, ""],
  [/google\/gemini-[\w.-]+/gi, "DeepRomeo Image"],
  [/api\.deepseek\.com/gi, ""],
];

export function maskProviderText(input: string): string {
  let out = input;
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
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
