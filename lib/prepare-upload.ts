import {
  EXTRACT_CHARS_PER_FILE,
  IMAGE_DATA_URL_MAX_CHARS,
  truncateExtractedText,
} from "./attachments";
import { extractPdfTextFromBytes } from "./pdf-text";
import type { Attachment } from "./types";

export const CLIENT_FILE_MAX_BYTES = 40 * 1024 * 1024;
export const SERVER_FALLBACK_MAX_BYTES = 3.5 * 1024 * 1024;
const IMAGE_TARGET_BYTES = 340_000;
const IMAGE_MAX_EDGE = 1280;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|heif|bmp|avif)$/i;
const TEXT_EXT = /\.(txt|md|csv|json|py|js|ts|tsx|jsx|css|html|xml|log|yml|yaml)$/i;

function guessMime(name: string, fallback: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png"].includes(ext)) return "image/png";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return fallback || "application/octet-stream";
}

function isImage(file: File) {
  return file.type.startsWith("image/") || IMAGE_EXT.test(file.name);
}

function isPdf(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isDocx(file: File) {
  return /\.docx$/i.test(file.name) || file.type.includes("wordprocessingml");
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || TEXT_EXT.test(file.name);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Gagal membaca file."));
    reader.readAsDataURL(blob);
  });
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Gagal mengompres gambar.");
  return blob;
}

async function compressImage(file: File): Promise<{ dataUrl: string; size: number; mime: string }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = null;
  }

  if (!bitmap) {
    if (file.size <= IMAGE_TARGET_BYTES) {
      const dataUrl = await blobToDataUrl(file);
      if (dataUrl.length > IMAGE_DATA_URL_MAX_CHARS) {
        throw new Error("Gambar terlalu besar. Simpan sebagai JPG lalu coba lagi.");
      }
      return { dataUrl, size: file.size, mime: file.type || "image/jpeg" };
    }
    throw new Error("Gambar ini tidak bisa dibaca (HEIC/format lain). Simpan sebagai JPG atau PNG.");
  }

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Gagal mengompres gambar.");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let quality = 0.74;
  let blob = await canvasToJpeg(canvas, quality);
  while (blob.size > IMAGE_TARGET_BYTES && quality > 0.42) {
    quality -= 0.1;
    blob = await canvasToJpeg(canvas, quality);
  }
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > IMAGE_DATA_URL_MAX_CHARS) {
    blob = await canvasToJpeg(canvas, 0.4);
    const smaller = await blobToDataUrl(blob);
    if (smaller.length > IMAGE_DATA_URL_MAX_CHARS) {
      throw new Error("Gambar masih terlalu besar setelah dikompres. Coba crop atau simpan sebagai JPG.");
    }
    return { dataUrl: smaller, size: blob.size, mime: "image/jpeg" };
  }
  return { dataUrl, size: blob.size, mime: "image/jpeg" };
}

export type PrepareResult =
  | { ok: true; attachment: Attachment }
  | { ok: false; error: string; serverFallback: boolean };

export async function prepareLocalAttachment(file: File): Promise<PrepareResult> {
  if (file.size > CLIENT_FILE_MAX_BYTES) {
    return {
      ok: false,
      error: `File terlalu besar (maks. ${Math.floor(CLIENT_FILE_MAX_BYTES / (1024 * 1024))} MB)`,
      serverFallback: false,
    };
  }

  const id = crypto.randomUUID();
  const mime = guessMime(file.name, file.type);

  try {
    if (isImage(file)) {
      const image = await compressImage(file);
      return {
        ok: true,
        attachment: {
          id,
          name: file.name,
          mime: image.mime,
          size: image.size,
          url: image.dataUrl,
          kind: "image",
          text: `[Image attached: ${file.name}]`,
        },
      };
    }

    if (isPdf(file)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extracted = await extractPdfTextFromBytes(bytes);
      const text = extracted
        ? truncateExtractedText(extracted, EXTRACT_CHARS_PER_FILE)
        : `[PDF terlampir: ${file.name}. Teks tidak bisa diekstrak (mungkin hasil scan).]`;
      return {
        ok: true,
        attachment: {
          id,
          name: file.name,
          mime: "application/pdf",
          size: file.size,
          url: "",
          kind: "file",
          text,
        },
      };
    }

    if (isTextFile(file)) {
      const raw = await file.text();
      return {
        ok: true,
        attachment: {
          id,
          name: file.name,
          mime: mime.startsWith("text/") ? mime : "text/plain",
          size: file.size,
          url: "",
          kind: "file",
          text: truncateExtractedText(raw, EXTRACT_CHARS_PER_FILE),
        },
      };
    }

    if (isDocx(file)) {
      if (file.size <= SERVER_FALLBACK_MAX_BYTES) {
        return { ok: false, error: "SERVER", serverFallback: true };
      }
      return {
        ok: false,
        error: "File Word terlalu besar. Simpan sebagai PDF atau TXT lalu unggah lagi.",
        serverFallback: false,
      };
    }

    const asText = await file.text().catch(() => "");
    if (asText && /[\x00-\x08]/.test(asText.slice(0, 200)) === false && asText.trim()) {
      return {
        ok: true,
        attachment: {
          id,
          name: file.name,
          mime,
          size: file.size,
          url: "",
          kind: "file",
          text: truncateExtractedText(asText, EXTRACT_CHARS_PER_FILE),
        },
      };
    }

    if (file.size <= SERVER_FALLBACK_MAX_BYTES) {
      return { ok: false, error: "SERVER", serverFallback: true };
    }
    return {
      ok: false,
      error: `Tidak bisa membaca ${file.name}. Simpan sebagai PDF, TXT, atau JPG.`,
      serverFallback: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyiapkan file.";
    return { ok: false, error: message, serverFallback: file.size <= SERVER_FALLBACK_MAX_BYTES };
  }
}
