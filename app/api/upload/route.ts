import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { extractFileText } from "@/lib/tools/files";
import { uploadsDir } from "@/lib/storage-paths";
import {
  IMAGE_DATA_URL_MAX_CHARS,
  serverUploadMaxBytes,
  tooLargeError,
  truncateExtractedText,
} from "@/lib/attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function POST(req: NextRequest) {
  const maxBytes = serverUploadMaxBytes();
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes + 64_000) {
    // The filename is only known after parsing the body, which is exactly what
    // is too big to parse — so keep the message generic rather than calling
    // every oversized upload a PDF.
    return Response.json({ error: tooLargeError("", maxBytes) }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { error: `File terlalu besar atau unggahan gagal (maks. ${Math.floor(maxBytes / (1024 * 1024))} MB)` },
      { status: 413 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > maxBytes) {
    return Response.json({ error: tooLargeError(file.name, maxBytes) }, { status: 413 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const dir = uploadsDir();
    fs.mkdirSync(dir, { recursive: true });
    const id = crypto.randomUUID();
    const ext = path.extname(file.name) || "";
    const dest = path.join(dir, `${id}${ext}`);
    fs.writeFileSync(dest, buf);
    const extracted = await withTimeout(
      extractFileText(dest, file.type || "application/octet-stream", file.name),
      15_000,
      "Gagal mengekstrak file (waktu habis). Coba file yang lebih kecil.",
    );
    const text = extracted.kind === "file" ? truncateExtractedText(extracted.text || "") : extracted.text;
    const mime = file.type || (extracted.kind === "image" ? "image/png" : "application/octet-stream");
    let publicUrl = `/api/files/${id}${ext}`;
    if (extracted.kind === "image") {
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      if (dataUrl.length <= IMAGE_DATA_URL_MAX_CHARS) publicUrl = dataUrl;
    }
    return Response.json({
      attachment: {
        id,
        name: file.name,
        mime,
        size: file.size,
        url: publicUrl,
        kind: extracted.kind,
        text,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengunggah file.";
    return Response.json({ error: message }, { status: 500 });
  }
}
