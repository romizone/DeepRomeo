/**
 * Request-body guards for the CRUD routes.
 *
 * These routes used to destructure `await req.json()` directly, so an empty
 * body, a non-object body, or malformed JSON reached the database as
 * `undefined` and surfaced as a bare 500 with no body — trivially reachable on
 * a public demo, and useless to whoever hit it.
 */

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

/** A non-empty string, trimmed. Returns null when absent or the wrong type. */
export function readString(source: Record<string, unknown>, field: string): string | null {
  const value = source[field];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** An optional string; absent stays undefined, wrong type is coerced away. */
export function readOptionalString(
  source: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = source[field];
  return typeof value === "string" ? value : undefined;
}

export function readBoolean(source: Record<string, unknown>, field: string): boolean | null {
  const value = source[field];
  return typeof value === "boolean" ? value : null;
}
