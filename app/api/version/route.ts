import { storageIsEphemeral } from "@/lib/storage-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which build is actually serving. A failing commit leaves the previous
 * deployment in place, so "my fix is not live" and "my fix is wrong" look
 * identical from the outside without this.
 */
export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  return Response.json({
    commit: sha ? sha.slice(0, 7) : "local",
    fullCommit: sha || null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    environment: process.env.VERCEL_ENV || "development",
    // Booleans only — never the values.
    configured: {
      model: Boolean(process.env.DEEPROMEO_API_KEY),
      image: Boolean(process.env.OPENROUTER_API_KEY),
      persistentStorage: !storageIsEphemeral(),
    },
  });
}
