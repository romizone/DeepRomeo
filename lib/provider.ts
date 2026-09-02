import "server-only";

/**
 * One model behind everything, Chat and Work alike. The vision-capable Flash
 * model reads images as well as text, so there is nothing left to switch on.
 * ModelId still exists in stored conversations from before; it is carried
 * along and ignored.
 */
export const PROVIDER_MODEL = "deepseek-v4-flash-vision-exp";

export function getProviderConfig() {
  const apiKey = process.env.DEEPROMEO_API_KEY;
  const baseURL = (process.env.DEEPROMEO_API_BASE || "https://api.deepseek.com").replace(
    /\/$/,
    "",
  );
  if (!apiKey) {
    throw new Error("DeepRomeo is not configured. Set DEEPROMEO_API_KEY in the server environment.");
  }
  return { apiKey, baseURL };
}
