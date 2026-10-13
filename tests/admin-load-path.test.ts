import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function loadAdminScript() {
  const page = readFileSync("src/pages/admin.astro", "utf8");
  const match = page.match(/<script is:inline>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("admin page script not found");
  return match[1];
}

type FakeEl = {
  id: string;
  style: Record<string, string>;
  disabled: boolean;
  textContent: string;
  value: string;
  innerHTML: string;
  children: FakeEl[];
  attrs: Record<string, string>;
  classList: { add: () => void; remove: () => void; contains: () => boolean };
  addEventListener: (type: string, fn: (event: { key: string }) => void) => void;
  setAttribute: (name: string, value: string) => void;
  appendChild: (child: FakeEl) => FakeEl;
};

function createEl(id = ""): FakeEl {
  const el: FakeEl = {
    id,
    style: {},
    disabled: false,
    textContent: "",
    value: "",
    innerHTML: "",
    children: [],
    attrs: {},
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get() {
      return html;
    },
    set(value: string) {
      html = value;
      el.children = [];
    },
  });
  return el;
}

function walk(el: FakeEl, acc: FakeEl[] = []): FakeEl[] {
  acc.push(el);
  for (const child of el.children) walk(child, acc);
  return acc;
}

function boot(options: { adminKey?: string } = {}) {
  const elements = new Map<string, FakeEl>();
  const ids = [
    "password",
    "login-error",
    "login-form",
    "dashboard",
    "session-list",
    "report-btn",
    "export-btn",
    "main-empty",
    "main-content",
    "main-title",
    "main-subtitle",
    "attendee-table",
    "report-content",
  ];
  for (const id of ids) elements.set(id, createEl(id));
  const button = createEl("sign-in");
  button.textContent = "Sign In";

  const storage = new Map<string, string>();
  if (options.adminKey) storage.set("admin_key", options.adminKey);

  const fetches: string[] = [];
  const pending: Array<{
    resolve: (value: { status: number; ok: boolean; json: () => Promise<unknown> }) => void;
  }> = [];

  const document = {
    getElementById(id: string) {
      return elements.get(id) ?? null;
    },
    createElement() {
      return createEl();
    },
    querySelector(selector: string) {
      if (selector === "#login-form button") return button;
      const attr = selector.match(/^\[data-product="(.+)"\]$/);
      if (!attr) return null;
      return walk(elements.get("session-list")!).find((el) => el.attrs["data-product"] === attr[1]) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector !== "[data-product]") return [];
      return walk(elements.get("session-list")!).filter((el) => el.attrs["data-product"]);
    },
  };

  const sessionStorage = {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
  };

  function fetch(url: string) {
    fetches.push(String(url));
    return new Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>((resolve) => {
      pending.push({ resolve });
    });
  }

  const api = new Function(
    "document",
    "sessionStorage",
    "fetch",
    "location",
    "Chart",
    "URL",
    "Blob",
    `${loadAdminScript()}\nreturn { login: login, showDashboard: showDashboard, loadSessions: loadSessions, selectSession: selectSession };`,
  )(document, sessionStorage, fetch, { reload() {} }, function Chart() {}, URL, Blob);

  return { api, elements, button, fetches, pending, storage };
}

function jsonResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

const session = {
  productId: "prod_june",
  date: "2026-06-23",
  dateDisplay: "June 23, 2026",
  location: "Columbus, OH",
  sold: 2,
  remaining: 38,
  maxSeats: 40,
  achCount: 1,
  cardCount: 1,
  revenue: 1900,
  priceAchAmount: 950,
};

describe("admin sign-in load path", () => {
  it("uses the single attendees response and does not fetch again", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";

    const done = page.api.login();
    await Promise.resolve();
    expect(page.fetches).toEqual(["/api/attendees?key=secret"]);

    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await done;

    expect(page.fetches).toHaveLength(1);
    expect(page.elements.get("dashboard")!.style.display).toBe("block");
    expect(page.elements.get("login-form")!.style.display).toBe("none");
    expect(page.storage.get("admin_key")).toBe("secret");
    expect(page.elements.get("session-list")!.children).toHaveLength(1);
    expect(page.elements.get("session-list")!.children[0].innerHTML).toContain("June 23, 2026");
    expect(page.elements.get("session-list")!.children[0].innerHTML).toContain("2 / 40");
  });

  it("shows the empty-blob message from one response", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(200, { ready: false, sessions: [] }));
    await done;

    expect(page.fetches).toHaveLength(1);
    expect(page.elements.get("session-list")!.innerHTML).toContain("isn't ready yet");
    expect(page.elements.get("session-list")!.children).toHaveLength(0);
  });

  it("keeps a bad password on the login form after one request", async () => {
    const page = boot();
    page.elements.get("password")!.value = "nope";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(401, { error: "Unauthorized" }));
    await done;

    expect(page.fetches).toHaveLength(1);
    expect(page.elements.get("login-error")!.style.display).toBe("block");
    expect(page.elements.get("dashboard")!.style.display).not.toBe("block");
    expect(page.storage.has("admin_key")).toBe(false);
    expect(page.button.textContent).toBe("Sign In");
  });

  it("loads once for a returning admin", async () => {
    const page = boot({ adminKey: "secret" });
    expect(page.fetches).toEqual(["/api/attendees?key=secret"]);
    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(page.fetches).toHaveLength(1);
    expect(page.elements.get("session-list")!.children).toHaveLength(1);
    expect(page.elements.get("dashboard")!.style.display).toBe("block");
  });

  it("opens a class with one product read and does not list sessions again", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await done;

    const detail = page.api.selectSession("prod_june");
    await Promise.resolve();
    expect(page.fetches).toHaveLength(2);
    expect(page.fetches[1]).toBe("/api/attendees?key=secret&product=prod_june");
    page.pending[1].resolve(
      jsonResponse(200, {
        ready: true,
        attendees: [
          {
            name: "Ada Lovelace",
            email: "ada@example.com",
            amount: "$950.00",
            paymentMethod: "Card",
            date: "2026-05-01",
            status: "paid",
          },
        ],
      }),
    );
    await detail;
    expect(page.fetches).toHaveLength(2);
    expect(page.elements.get("attendee-table")!.innerHTML).toContain("Ada Lovelace");
  });
});
