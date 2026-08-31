import "server-only";
import type { ModelId } from "./types";

export const PROVIDER_MODELS: Record<ModelId, string> = {
  flash: "deepseek-v4-flash",
  vision: "deepseek-v4-flash-vision-exp",
  pro: "deepseek-v4-pro",
};

export function getProviderConfig() {
  const apiKey = process.env.DEEPROMEO_API_KEY;
  const baseURL = (process.env.DEEPROMEO_API_BASE || "https://api.deepseek.com").replace(
    /\/$/,
    "",
  );
  if (!apiKey) {
    throw new Error("DeepRomeo is not configured. Add an API key in Settings.");
  }
  return { apiKey, baseURL };
}

export function resolveProviderModel(id: ModelId, hasImages: boolean): string {
  if (hasImages) return PROVIDER_MODELS.vision;
  return PROVIDER_MODELS[id];
}
