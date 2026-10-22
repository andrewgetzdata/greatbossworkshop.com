import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REPORT_LABELS,
  aggregateReportMetrics,
  formatReportMoney,
} from "../src/lib/report-metrics";
import type { SessionStat } from "../src/lib/report-forecast";

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
  click: () => void;
  querySelectorAll: (selector: string) => FakeEl[];
  getAttribute: (name: string) => string | null;
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
    click() {},
    querySelectorAll(selector: string) {
      if (selector !== "[data-refund]") return [];
      const found: FakeEl[] = [];
      const html = this.innerHTML || "";
      for (const match of html.matchAll(/data-refund="([^"]+)"/g)) {
        const btn = createEl();
        btn.attrs["data-refund"] = match[1];
        btn.getAttribute = (name: string) => btn.attrs[name] ?? null;
        found.push(btn);
      }
      return found;
    },
    getAttribute(name: string) {
      return this.attrs[name] ?? null;
    },
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
    "annual-btn",
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
    "report-years",
    "report-body",
  ];
  for (const id of ids) elements.set(id, createEl(id));
  const button = createEl("sign-in");
  button.textContent = "Sign In";

  const storage = new Map<string, string>();
  if (options.adminKey) storage.set("admin_key", options.adminKey);

  const fetches: string[] = [];
  const bodies: Array<string | undefined> = [];
  const confirms: string[] = [];
  let allowRefund = false;
  const pending: Array<{
    resolve: (value: {
      status: number;
      ok: boolean;
      headers: { get: (name: string) => string | null };
      json: () => Promise<unknown>;
      text: () => Promise<string>;
    }) => void;
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

  function fetch(url: string, init?: { body?: string }) {
    fetches.push(String(url));
    bodies.push(init?.body);
    return new Promise<{
      status: number;
      ok: boolean;
      headers: { get: (name: string) => string | null };
      json: () => Promise<unknown>;
      text: () => Promise<string>;
    }>((resolve) => {
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
    "confirm",
    `${loadAdminScript()}\nreturn { login: login, showDashboard: showDashboard, loadSessions: loadSessions, selectSession: selectSession, exportCSV: exportCSV, loadReport: loadReport, downloadAnnual: downloadAnnual, refundAttendee: refundAttendee };`,
  )(
    document,
    sessionStorage,
    fetch,
    { reload() {} },
    function Chart() {},
    { createObjectURL() { return "blob:csv"; }, revokeObjectURL() {} },
    Blob,
    (message: string) => {
      confirms.push(message);
      return allowRefund;
    },
  );

  return {
    api,
    elements,
    button,
    fetches,
    bodies,
    confirms,
    pending,
    storage,
    setAllowRefund(value: boolean) {
      allowRefund = value;
    },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
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
    expect(page.elements.get("login-error")!.textContent).toBe("Invalid password. Please try again.");
    expect(page.elements.get("dashboard")!.style.display).not.toBe("block");
    expect(page.storage.has("admin_key")).toBe(false);
    expect(page.button.textContent).toBe("Sign In");
  });

  it("does not call a failed class-status read a bad password", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(502, "blob read failed"));
    await done;

    expect(page.fetches).toHaveLength(1);
    expect(page.elements.get("login-error")!.style.display).toBe("block");
    expect(page.elements.get("login-error")!.textContent).not.toContain("Invalid password");
    expect(page.elements.get("login-error")!.textContent).toContain("Class status");
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

  it("does not call Stripe until the refund is confirmed", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await done;

    const declined = page.api.refundAttendee({
      status: "paid",
      checkoutSessionId: "cs_test_1",
      name: "Ada Lovelace",
      amount: "$950.00",
    });
    await declined;
    expect(page.confirms[0]).toContain("full remaining amount");
    expect(page.fetches).toHaveLength(1);

    page.setAllowRefund(true);
    const accepted = page.api.refundAttendee({
      status: "paid",
      checkoutSessionId: "cs_test_1",
      name: "Ada Lovelace",
      amount: "$950.00",
    });
    await Promise.resolve();
    expect(page.fetches).toHaveLength(2);
    expect(page.fetches[1]).toBe("/api/refund-attendee?key=secret");
    expect(page.bodies[1]).toBe(JSON.stringify({ checkoutSessionId: "cs_test_1" }));
    expect(page.bodies[1]).not.toContain("amount");
    page.pending[1].resolve(jsonResponse(200, { ok: true, alreadyRefunded: false, refreshed: true }));
    await accepted;
  });

  it("downloads one class CSV and the annual report from the blob endpoints", async () => {
    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await done;
    page.api.selectSession("prod_june");
    await Promise.resolve();
    page.pending[1].resolve(jsonResponse(200, { ready: true, attendees: [] }));
    await Promise.resolve();

    const exporting = page.api.exportCSV();
    await Promise.resolve();
    expect(page.fetches[2]).toBe("/api/attendees?key=secret&product=prod_june&format=csv");
    page.pending[2].resolve(
      jsonResponse(200, "Class,Email\r\n", {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="attendees-2026-06-23-prod_june.csv"',
      }),
    );
    await exporting;

    const loading = page.api.loadReport(2026);
    await Promise.resolve();
    expect(page.fetches[3]).toBe("/api/report?key=secret&year=2026");
    page.pending[3].resolve(jsonResponse(200, { availableYears: [2026], sessions: [], refunds: [] }));
    await loading;
    expect(page.elements.get("annual-btn")!.getAttribute("data-year")).toBe("2026");
    expect(page.elements.get("report-years")!.innerHTML).toContain("2026");
    expect(page.elements.get("report-body")!.innerHTML).toContain("No sessions in 2026");

    const annual = page.api.downloadAnnual();
    await Promise.resolve();
    expect(page.fetches[4]).toBe("/api/attendees?key=secret&format=annual&year=2026");
    page.pending[4].resolve(
      jsonResponse(200, "Class,Date\r\n", { "content-type": "text/csv; charset=utf-8" }),
    );
    await annual;
    expect(page.fetches).toHaveLength(5);
  });

  it("renders report card values that match ACH, card, signup, and sellout math", async () => {
    const reportSessions: SessionStat[] = [
      {
        productId: "prod_apr",
        date: "2026-04-15",
        dateDisplay: "Apr 15, 2026",
        location: "Detroit",
        maxSeats: 25,
        sold: 25,
        remaining: 0,
        isPast: true,
        achCount: 14,
        cardCount: 11,
        achRevenue: 13300,
        cardRevenue: 10450,
        revenue: 23750,
        refundCount: 0,
        refundAmount: 0,
        priceAchAmount: 950,
        priceCardAmount: 979,
      },
      {
        productId: "prod_june",
        date: "2026-06-23",
        dateDisplay: "Jun 23, 2026",
        location: "Chicago",
        maxSeats: 25,
        sold: 15,
        remaining: 10,
        isPast: false,
        achCount: 10,
        cardCount: 5,
        achRevenue: 9500,
        cardRevenue: 4750,
        revenue: 14250,
        refundCount: 1,
        refundAmount: 950,
        priceAchAmount: 950,
        priceCardAmount: 979,
      },
    ];
    const metrics = aggregateReportMetrics(reportSessions, [{ amount: 950 }]);
    expect(metrics.projected).not.toBe(metrics.fullSellout);
    expect(metrics.projected).not.toBe(metrics.totalRevenue);
    expect(metrics.netRevenue).toBe(metrics.totalRevenue);

    const page = boot();
    page.elements.get("password")!.value = "secret";
    const done = page.api.login();
    await Promise.resolve();
    page.pending[0].resolve(jsonResponse(200, { ready: true, sessions: [session] }));
    await done;

    const loading = page.api.loadReport(2026);
    await Promise.resolve();
    page.pending[1].resolve(
      jsonResponse(200, {
        availableYears: [2026],
        refunds: [{ amount: 950 }],
        sessions: reportSessions,
      }),
    );
    await loading;

    const html = page.elements.get("report-body")!.innerHTML;
    expect(html).toContain(REPORT_LABELS.totalRevenue);
    expect(html).toContain(formatReportMoney(metrics.totalRevenue));
    expect(html).toContain(formatReportMoney(metrics.achRevenue));
    expect(html).toContain(formatReportMoney(metrics.cardRevenue));
    expect(html).toContain(REPORT_LABELS.signups);
    expect(html).toContain(">" + metrics.signups + "<");
    expect(html).toContain(REPORT_LABELS.refunds);
    expect(html).toContain(formatReportMoney(-metrics.refundTotal));
    expect(html).toContain(REPORT_LABELS.netRevenue);
    expect(html).toContain(formatReportMoney(metrics.netRevenue));
    expect(html).toContain(REPORT_LABELS.fullSellout);
    expect(html).toContain(formatReportMoney(metrics.fullSellout));
    expect(html).toContain(REPORT_LABELS.projected);
    expect(html).toContain(formatReportMoney(metrics.projected));
    expect(html).not.toContain(formatReportMoney(metrics.totalRevenue - metrics.refundTotal));
  });

  it("keeps the annual download on the report view for the chart year", () => {
    const page = readFileSync("src/pages/admin.astro", "utf8");
    const reportStart = page.indexOf('id="report-content"');
    const scriptStart = page.indexOf("<script is:inline>");
    const report = page.slice(reportStart, scriptStart);
    expect(page.slice(0, reportStart)).not.toContain('id="annual-year"');
    expect(page.slice(0, reportStart)).not.toContain("Annual report");
    expect(page.slice(0, reportStart)).not.toContain('id="annual-btn"');
    expect(report).toContain('id="annual-btn"');
    expect(report).toContain('aria-label="Download annual report"');
    expect(loadAdminScript()).not.toContain("annual-year");
  });
});
