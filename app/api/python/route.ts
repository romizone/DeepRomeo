import { runPython } from "@/lib/tools/python";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { code } = (await req.json()) as { code?: string };
  const result = await runPython(String(code || ""));
  return Response.json(result);
}
