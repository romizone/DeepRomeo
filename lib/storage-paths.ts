import path from "node:path";

/**
 * Single source of truth for on-disk locations. The data and upload paths were
 * previously recomputed in four places, so pointing the app at a persistent
 * volume only worked in some of them.
 *
 * On Vercel the default falls back to /tmp, which is per-instance and wiped
 * between invocations. Set DEEPROMEO_DATA_DIR / DEEPROMEO_UPLOADS_DIR to a
 * persistent volume for durable storage.
 */
export function dataDir(): string {
  const configured = process.env.DEEPROMEO_DATA_DIR;
  if (configured) return configured;
  return process.env.VERCEL ? path.join("/tmp", "deepromeo") : path.join(process.cwd(), "data");
}

export function uploadsDir(): string {
  const configured = process.env.DEEPROMEO_UPLOADS_DIR;
  if (configured) return configured;
  return process.env.VERCEL
    ? path.join("/tmp", "deepromeo-uploads")
    : path.join(process.cwd(), "uploads");
}

/** Where a stored upload might live, newest layout first. */
export function uploadCandidates(fileName: string): string[] {
  const safe = path.basename(fileName);
  const dirs = [uploadsDir(), path.join("/tmp", "deepromeo-uploads"), path.join(process.cwd(), "uploads")];
  return [...new Set(dirs)].map((dir) => path.join(dir, safe));
}

export function storageIsEphemeral(): boolean {
  return Boolean(process.env.VERCEL) && !process.env.DEEPROMEO_DATA_DIR;
}

/** True when a written upload will not outlive the request that created it. */
export function uploadsAreEphemeral(): boolean {
  return Boolean(process.env.VERCEL) && !process.env.DEEPROMEO_UPLOADS_DIR;
}
