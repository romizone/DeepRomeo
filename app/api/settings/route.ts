import { getSettings, saveSettings } from "@/lib/tools/execute";
import { badRequest, readJsonObject } from "@/lib/api-input";

const THEMES = ["system", "light", "dark"];

export async function GET() {
  const settings = await getSettings();
  return Response.json({
    settings,
    imageConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    modelConfigured: Boolean(process.env.DEEPROMEO_API_KEY),
  });
}

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  if (!body) return badRequest("Body harus berupa objek JSON.");

  // Whitelist: this blob is merged into stored settings and read back on every
  // chat request, so arbitrary keys should not accumulate in it.
  const next: Record<string, unknown> = {};
  if (typeof body.theme === "string") {
    if (!THEMES.includes(body.theme)) return badRequest("Field 'theme' tidak dikenal.");
    next.theme = body.theme;
  }
  if (typeof body.memoryEnabled === "boolean") next.memoryEnabled = body.memoryEnabled;
  if (typeof body.spokenLanguage === "string") next.spokenLanguage = body.spokenLanguage;

  const settings = await saveSettings(next);
  return Response.json({ settings });
}
