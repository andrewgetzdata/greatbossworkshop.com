/**
 * Resolve the base URL for checkout success/cancel redirects.
 * Prefer an explicit PUBLIC_SITE_URL (production); otherwise derive it from the
 * incoming request headers so local dev works on whatever port `netlify dev`
 * picked — no env maintenance needed. Pure + dependency-free for unit testing.
 */
export function resolveSiteUrl(
  headers: Record<string, string | undefined> | undefined,
  publicSiteUrl: string | undefined
): string {
  if (publicSiteUrl) return publicSiteUrl;

  const h = headers ?? {};
  const origin = h.origin || h.Origin;
  if (origin) return origin.replace(/\/$/, "");

  const host = h.host || h.Host;
  if (host) {
    const proto = h["x-forwarded-proto"] || (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }

  return "https://greatbossworkshop.com";
}
