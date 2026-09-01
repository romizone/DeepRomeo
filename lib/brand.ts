import "server-only";

export { createStreamMasker, maskProviderText } from "./mask-stream";
import { maskProviderText } from "./mask-stream";

export function maskError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Something went wrong.";
  const masked = maskProviderText(raw);
  // Bare substring matches fired on any message that happened to contain
  // these digits — a token count, an id, a line number.
  if (/api key|unauthorized|\b401\b/i.test(masked)) {
    return "DeepRomeo could not authenticate. Check DEEPROMEO_API_KEY in the server environment.";
  }
  if (/\b429\b|rate limit/i.test(masked)) {
    return "DeepRomeo is busy right now. Try again in a moment.";
  }
  // Raw transport errors ("terminated", "fetch failed", ECONNRESET) reach the
  // user verbatim otherwise, which tells them nothing.
  if (/terminated|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EPIPE|network/i.test(masked)) {
    return "Koneksi ke DeepRomeo terputus di tengah jalan. Jawaban di atas mungkin belum lengkap.";
  }
  return masked || "Something went wrong. Please try again.";
}
