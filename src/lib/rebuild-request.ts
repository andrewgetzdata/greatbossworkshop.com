import { adminKeyMatches } from "./workshop-webhook.js";

export interface RebuildRequestEvent {
  httpMethod: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
}

function headerValue(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value) return value;
  }
  return undefined;
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

/**
 * Auth gate for the one-time backfill and the webhook-triggered rebuild.
 * The scan itself is injected so this stays free of Stripe.
 */
export async function handleRebuildRequest(
  event: RebuildRequestEvent,
  deps: { rebuild: () => Promise<void>; adminKey?: string },
) {
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const provided = headerValue(event.headers, "x-admin-key") || event.queryStringParameters?.key;
  const expected = deps.adminKey ?? process.env.ADMIN_API_KEY;
  if (!adminKeyMatches(expected, provided)) {
    console.error("Class status rebuild rejected: admin key mismatch");
    return json(401, { error: "Unauthorized" });
  }

  await deps.rebuild();
  return json(202, { ok: true });
}
