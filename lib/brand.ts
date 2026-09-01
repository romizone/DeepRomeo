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
  if (/api key|unauthorized|401/i.test(masked)) {
    return "DeepRomeo could not authenticate. Check DEEPROMEO_API_KEY in the server environment.";
  }
  if (/429|rate limit/i.test(masked)) {
    return "DeepRomeo is busy right now. Try again in a moment.";
  }
  return masked || "Something went wrong. Please try again.";
}
