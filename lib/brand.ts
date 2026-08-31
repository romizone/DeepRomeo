import "server-only";

const REPLACEMENTS: [RegExp, string][] = [
  [/deepseek-v4-flash-vision-exp/gi, "DeepRomeo Vision"],
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

export function maskError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong.";
  const masked = maskProviderText(raw);
  if (/api key|unauthorized|401/i.test(masked)) {
    return "DeepRomeo could not authenticate. Check your API key in Settings.";
  }
  if (/429|rate limit/i.test(masked)) {
    return "DeepRomeo is busy right now. Try again in a moment.";
  }
  return masked || "Something went wrong. Please try again.";
}
