import { describe, it, expect } from "vitest";
import { resolveSiteUrl } from "../src/lib/site-url";

// resolveSiteUrl decides where Stripe redirects after payment. The bug this
// fixes: a stale PUBLIC_SITE_URL (or wrong local port) sent users to a dead
// URL. Production still pins to PUBLIC_SITE_URL; local dev derives from the
// request so it works on whatever port netlify dev chose.
describe("resolveSiteUrl", () => {
  it("prefers an explicit PUBLIC_SITE_URL (production)", () => {
    expect(resolveSiteUrl({ origin: "http://localhost:8888" }, "https://roygetz.com")).toBe(
      "https://roygetz.com"
    );
  });

  it("derives from the origin header when no env is set (any local port)", () => {
    expect(resolveSiteUrl({ origin: "http://localhost:8888" }, undefined)).toBe(
      "http://localhost:8888"
    );
  });

  it("strips a trailing slash from origin", () => {
    expect(resolveSiteUrl({ origin: "http://localhost:8888/" }, undefined)).toBe(
      "http://localhost:8888"
    );
  });

  it("reconstructs from host + x-forwarded-proto when there's no origin", () => {
    expect(
      resolveSiteUrl({ host: "roygetz.com", "x-forwarded-proto": "https" }, undefined)
    ).toBe("https://roygetz.com");
  });

  it("assumes http for a localhost host with no proto header", () => {
    expect(resolveSiteUrl({ host: "localhost:8888" }, undefined)).toBe("http://localhost:8888");
  });

  it("falls back to the production default when nothing is available", () => {
    expect(resolveSiteUrl({}, undefined)).toBe("https://greatbossworkshop.com");
  });
});
