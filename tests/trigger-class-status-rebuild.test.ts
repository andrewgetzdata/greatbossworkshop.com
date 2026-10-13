import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerClassStatusRebuild } from "../netlify/functions/lib/trigger-class-status-rebuild";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("triggerClassStatusRebuild", () => {
  it("posts the admin key in a header and not in the URL", async () => {
    vi.stubEnv("ADMIN_API_KEY", "secret-key");
    const fetchMock = vi.fn(
      async (_url: string, init?: { method?: string; headers?: Record<string, string> }) => {
        void init;
        return { ok: true, status: 202 };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await triggerClassStatusRebuild({
      headers: { host: "greatbossworkshop.com", "x-forwarded-proto": "https" },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    const init = call[1];
    expect(String(call[0])).toBe(
      "https://greatbossworkshop.com/.netlify/functions/rebuild-class-status-background",
    );
    expect(String(call[0])).not.toContain("secret-key");
    expect(init?.headers?.["x-admin-key"]).toBe("secret-key");
    expect(init?.method).toBe("POST");
  });
});
