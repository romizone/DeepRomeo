import { getSettings, saveSettings } from "@/lib/tools/execute";

export async function GET() {
  const settings = await getSettings();
  return Response.json({
    settings,
    imageConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    modelConfigured: Boolean(process.env.DEEPROMEO_API_KEY),
  });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const settings = await saveSettings(body);
  return Response.json({ settings });
}
