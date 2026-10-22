import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { annualSelloutReport } from "../src/lib/annual-report";
import type { ClassStatusSession } from "../src/lib/class-status";
import {
  DEFAULT_FILL_RATE,
  forecastSession,
  forecastYear,
  type SessionStat,
} from "../src/lib/report-forecast";
import {
  REPORT_LABELS,
  aggregateReportMetrics,
  emptySessionPaymentStats,
  formatReportMoney,
  labeledReportCards,
  recordCompletedCheckout,
} from "../src/lib/report-metrics";

function stat(over: Partial<SessionStat> = {}): SessionStat {
  return {
    productId: "p",
    date: "2026-09-01",
    dateDisplay: "Sep 1, 2026",
    location: "Columbus, OH",
    maxSeats: 40,
    sold: 10,
    remaining: 30,
    isPast: false,
    achCount: 8,
    cardCount: 2,
    achRevenue: 7600,
    cardRevenue: 1958,
    revenue: 9558,
    refundCount: 0,
    refundAmount: 0,
    priceAchAmount: 950,
    priceCardAmount: 979,
    ...over,
  };
}

function classSession(over: Partial<ClassStatusSession> = {}): ClassStatusSession {
  return {
    productId: "prod_june",
    name: "June 23",
    date: "2026-06-23",
    dateDisplay: "June 23, 2026",
    location: "Columbus, OH",
    maxSeats: 40,
    sold: 1,
    remaining: 39,
    achCount: 1,
    cardCount: 0,
    revenue: 950,
    priceAchAmount: 950,
    attendees: [],
    ...over,
  };
}

describe("recordCompletedCheckout", () => {
  it("splits booked revenue into ACH vs Card and keeps the total equal to both", () => {
    const stats = emptySessionPaymentStats();
    recordCompletedCheckout(stats, { isAch: true, amountDollars: 950, isRefunded: false });
    recordCompletedCheckout(stats, { isAch: false, amountDollars: 979, isRefunded: false });
    expect(stats.achCount).toBe(1);
    expect(stats.cardCount).toBe(1);
    expect(stats.achRevenue).toBe(950);
    expect(stats.cardRevenue).toBe(979);
    expect(stats.revenue).toBe(stats.achRevenue + stats.cardRevenue);
    expect(stats.refundCount).toBe(0);
    expect(stats.refundAmount).toBe(0);
  });

  it("counts a refunded checkout as a refund, not as booked revenue", () => {
    const stats = emptySessionPaymentStats();
    recordCompletedCheckout(stats, {
      isAch: true,
      amountDollars: 950,
      isRefunded: true,
      refundAmountDollars: 950,
    });
    expect(stats.revenue).toBe(0);
    expect(stats.achRevenue).toBe(0);
    expect(stats.cardRevenue).toBe(0);
    expect(stats.refundCount).toBe(1);
    expect(stats.refundAmount).toBe(950);
  });
});

describe("aggregateReportMetrics", () => {
  const past = stat({
    productId: "prod_apr",
    date: "2026-04-15",
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
  });
  const future = stat({
    productId: "prod_june",
    date: "2026-06-23",
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
  });

  it("totals ACH vs Card revenue and signups the way the cards claim", () => {
    const metrics = aggregateReportMetrics([past, future], [{ amount: 950 }]);

    expect(metrics.achRevenue).toBe(22800);
    expect(metrics.cardRevenue).toBe(15200);
    expect(metrics.totalRevenue).toBe(metrics.achRevenue + metrics.cardRevenue);
    expect(metrics.totalRevenue).toBe(38000);
    expect(metrics.signups).toBe(40);
    expect(metrics.achCount).toBe(24);
    expect(metrics.cardCount).toBe(16);
    expect(metrics.refundTotal).toBe(950);
    expect(metrics.refundCount).toBe(1);
    expect(metrics.netRevenue).toBe(metrics.totalRevenue);
    expect(metrics.netRevenue).not.toBe(metrics.totalRevenue - metrics.refundTotal);
  });

  it("treats full sellout as capacity at the ACH price, not booked revenue", () => {
    const metrics = aggregateReportMetrics([past, future]);
    const year = forecastYear([past, future], DEFAULT_FILL_RATE);

    expect(metrics.fullSellout).toBe(25 * 950 + 25 * 950);
    expect(metrics.fullSellout).toBe(year.maxRevenue);
    expect(metrics.totalRevenue).toBe(38000);
    expect(metrics.fullSellout).not.toBe(metrics.totalRevenue);
    expect(metrics.selloutGap).toBe(metrics.fullSellout - metrics.totalRevenue);
    expect(year.projected).not.toBe(year.actual);
    expect(year.projected).not.toBe(year.maxRevenue);
    expect(year.projected).toBe(
      forecastSession(past).expected + forecastSession(future).expected,
    );
    expect(year.projected).toBe(23750 + 24 * 950);
  });

  it("matches the annual report's if-fully-sold-out total", () => {
    const sessions = [past, future];
    const metrics = aggregateReportMetrics(sessions);
    const annual = annualSelloutReport(
      sessions.map((s) =>
        classSession({
          productId: s.productId,
          name: s.dateDisplay,
          date: s.date,
          dateDisplay: s.dateDisplay,
          maxSeats: s.maxSeats,
          sold: s.sold,
          remaining: s.remaining,
          achCount: s.achCount,
          cardCount: s.cardCount,
          revenue: s.revenue,
          priceAchAmount: s.priceAchAmount,
        }),
      ),
      "2026",
      "2026-05-02",
    );
    expect(metrics.fullSellout).toBe(annual.totalFullSellout);
    expect(metrics.totalRevenue).toBe(annual.totalActual);
    expect(metrics.selloutGap).toBe(annual.totalGap);
  });

  it("keeps labeled card values identical to the aggregations", () => {
    const metrics = aggregateReportMetrics([past, future], [{ amount: 950 }]);
    const cards = labeledReportCards(metrics);
    const byLabel = Object.fromEntries(cards.map((c) => [c.label, c]));

    expect(byLabel[REPORT_LABELS.totalRevenue].value).toBe(metrics.totalRevenue);
    expect(byLabel[REPORT_LABELS.totalRevenue].display).toBe(formatReportMoney(metrics.totalRevenue));
    expect(byLabel[REPORT_LABELS.totalRevenue].detail).toContain(REPORT_LABELS.ach);
    expect(byLabel[REPORT_LABELS.totalRevenue].detail).toContain(formatReportMoney(metrics.achRevenue));
    expect(byLabel[REPORT_LABELS.totalRevenue].detail).toContain(REPORT_LABELS.card);
    expect(byLabel[REPORT_LABELS.totalRevenue].detail).toContain(formatReportMoney(metrics.cardRevenue));

    expect(byLabel[REPORT_LABELS.signups].value).toBe(metrics.signups);
    expect(byLabel[REPORT_LABELS.signups].display).toBe(String(metrics.signups));

    expect(byLabel[REPORT_LABELS.refunds].value).toBe(metrics.refundTotal);
    expect(byLabel[REPORT_LABELS.refunds].display).toBe(formatReportMoney(-metrics.refundTotal));

    expect(byLabel[REPORT_LABELS.netRevenue].value).toBe(metrics.netRevenue);
    expect(byLabel[REPORT_LABELS.netRevenue].display).toBe(formatReportMoney(metrics.netRevenue));

    expect(byLabel[REPORT_LABELS.fullSellout].value).toBe(metrics.fullSellout);
    expect(byLabel[REPORT_LABELS.projected].value).toBe(
      forecastYear([past, future]).projected,
    );
  });

  it("does not let a sold-out room at card prices masquerade as the ACH ceiling", () => {
    const soldOutCard = stat({
      maxSeats: 2,
      sold: 2,
      remaining: 0,
      isPast: true,
      achCount: 0,
      cardCount: 2,
      achRevenue: 0,
      cardRevenue: 1958,
      revenue: 1958,
      priceAchAmount: 950,
    });
    const metrics = aggregateReportMetrics([soldOutCard]);
    expect(metrics.fullSellout).toBe(2 * 950);
    expect(metrics.totalRevenue).toBe(1958);
    expect(metrics.totalRevenue).toBeGreaterThan(metrics.fullSellout);
  });
});

describe("forecastYear", () => {
  it("stacks per-session max / expected / actual into the year chart series", () => {
    const past = stat({ isPast: true, revenue: 1000, maxSeats: 10, remaining: 0, sold: 1, date: "2026-01-15" });
    const future = stat({
      isPast: false,
      revenue: 1900,
      maxSeats: 10,
      remaining: 8,
      sold: 2,
      date: "2026-09-01",
    });
    const year = forecastYear([past, future], 50);
    expect(year.perMax).toEqual([10 * 950, 10 * 950]);
    expect(year.perActual).toEqual([1000, 1900]);
    expect(year.perExpected).toEqual([1000, (2 + Math.round(8 * 0.5)) * 950]);
    expect(year.cumMax.at(-1)).toBe(year.maxRevenue);
    expect(year.cumActual.at(-1)).toBe(year.actual);
    expect(year.cumExpected.at(-1)).toBe(year.projected);
  });
});

describe("admin Report view labels", () => {
  const page = readFileSync("src/pages/admin.astro", "utf8");
  const reportStart = page.indexOf('id="report-content"');
  const scriptStart = page.indexOf("<script is:inline>");
  const report = page.slice(reportStart, scriptStart) + page.slice(scriptStart);

  it("renders every labeled metric the aggregations expose", () => {
    for (const label of Object.values(REPORT_LABELS)) {
      expect(page).toContain(label);
    }
  });

  it("keeps the download control on the report toolbar", () => {
    const toolbar = page.slice(reportStart, scriptStart);
    expect(toolbar).toContain('id="annual-btn"');
    expect(toolbar).toContain("Download annual report");
  });

  it("does not introduce off-brand gold or generic dashboard blue in report charts", () => {
    expect(report).not.toMatch(/#fbbf24/i);
    expect(report).not.toMatch(/#d4a843/i);
    expect(report).not.toMatch(/#3b82f6/i);
  });
});
