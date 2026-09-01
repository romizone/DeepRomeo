import { runPython } from "@/lib/tools/python";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { code } = (await req.json()) as { code?: string };
    const result = await runPython(String(code || ""));
    return Response.json(result);
  } catch (error) {
    return Response.json({
      stdout: "",
      stderr: error instanceof Error ? error.message : "Python failed",
    });
  }
}
