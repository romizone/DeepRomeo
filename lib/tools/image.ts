import "server-only";
import { maskError } from "../brand";
import { appUrl } from "../site";

export async function generateImage(prompt: string, aspectRatio = "1:1") {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image";
  if (!key) {
    return {
      error: "Image generation is not configured. Add an image API key in Settings.",
    };
  }

  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": appUrl(),
      "X-Title": "DeepRomeo",
    },
    body: JSON.stringify({
      model,
      prompt,
      aspect_ratio: aspectRatio,
      n: 1,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: { b64_json?: string; url?: string; media_type?: string }[];
    error?: { message?: string };
  };

  if (!res.ok) {
    return { error: maskError(json.error?.message || `Image request failed (${res.status})`) };
  }

  const item = json.data?.[0];
  if (item?.b64_json) {
    const mime = item.media_type || "image/png";
    return { url: `data:${mime};base64,${item.b64_json}` };
  }
  if (item?.url) return { url: item.url };
  return { error: "No image was returned." };
}

export function imageConfigured() {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
