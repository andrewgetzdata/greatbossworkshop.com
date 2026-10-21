import { classStatusRebuildUrl } from "../../../src/lib/workshop-webhook.js";

type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Ask the background function to rebuild. Await only its acknowledgement so
 * the webhook is not held for the Stripe scan. The admin key stays in a
 * header so it is not written into the URL.
 */
export async function triggerClassStatusRebuild(event: {
  headers?: Record<string, HeaderValue>;
}): Promise<void> {
  const headers = event.headers ?? {};
  const url = classStatusRebuildUrl({
    host: firstHeader(headers.host),
    forwardedProto: firstHeader(headers["x-forwarded-proto"]),
    deployPrimeUrl: process.env.DEPLOY_PRIME_URL,
    siteUrl: process.env.URL,
  });
  const key = process.env.ADMIN_API_KEY;
  if (!url || !key) {
    console.error("Class status rebuild skipped: missing site URL or ADMIN_API_KEY");
    return;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-admin-key": key },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Class status rebuild trigger failed: ${res.status}`);
  }
}
