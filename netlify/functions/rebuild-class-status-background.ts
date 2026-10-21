import { handleRebuildRequest } from "../../src/lib/rebuild-request.js";
import { rebuildClassStatus } from "./lib/rebuild-class-status.js";

/**
 * Background function (filename suffix). Netlify returns 202 before this
 * handler runs, so the checkout webhook can finish the confirmation email
 * without waiting on the Checkout Session scan. Also the one-time backfill:
 * POST or GET with the admin key in `x-admin-key` or `?key=`.
 */
export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string | undefined> | null;
  blobs: string;
}) {
  return handleRebuildRequest(event, {
    rebuild: () => rebuildClassStatus(event),
  });
}
