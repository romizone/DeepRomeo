import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { extractFileText } from "@/lib/tools/files";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const dir = process.env.VERCEL
    ? path.join("/tmp", "deepromeo-uploads")
    : path.join(process.cwd(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const ext = path.extname(file.name) || "";
  const dest = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(dest, buf);
  const extracted = await extractFileText(dest, file.type || "application/octet-stream", file.name);
  const kind = extracted.kind;
  return Response.json({
    attachment: {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      url: extracted.kind === "image" && "dataUrl" in extracted ? extracted.dataUrl : `/api/files/${id}${ext}`,
      kind,
      text: extracted.text,
    },
  });
}
