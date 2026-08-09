import { describe, it, expect } from "vitest";
import {
  forecastSession,
  computeTotals,
  DEFAULT_FILL_RATE,
  type SessionStat,
} from "../src/lib/report-forecast";

function stat(over: Partial<SessionStat>): SessionStat {
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

// forecastSession must reproduce admin.astro's math exactly, or the PDF cover
// sheet won't match the dashboard the user already trusts.
describe("forecastSession", () => {
  it("max revenue = maxSeats * base (ACH) price", () => {
    expect(forecastSession(stat({ maxSeats: 40, priceAchAmount: 950 })).maxRevenue).toBe(38000);
  });

  it("past session expects its actual revenue", () => {
    const f = forecastSession(stat({ isPast: true, revenue: 12345 }));
    expect(f.expected).toBe(12345);
    expect(f.actual).toBe(12345);
  });

  it("future session expects sold + fill-rate share of remaining, at base price", () => {
    // sold 10 + round(30 * 0.90)=27 -> 37 seats * 950 = 35150
    const f = forecastSession(stat({ isPast: false, sold: 10, remaining: 30 }), 90);
    expect(f.expected).toBe(37 * 950);
  });

  it("uses fallbacks (maxSeats 25, base 950) when fields are null/zero", () => {
    const f = forecastSession(
      stat({ maxSeats: 0, priceAchAmount: null, isPast: true, revenue: 0 })
    );
    expect(f.maxRevenue).toBe(25 * 950);
  });

  it("defaults to a 90% fill rate", () => {
    expect(DEFAULT_FILL_RATE).toBe(90);
    const f = forecastSession(stat({ isPast: false, sold: 0, remaining: 10 }));
    expect(f.expected).toBe(Math.round(10 * 0.9) * 950); // 9 * 950
  });
});

// computeTotals aggregates the cover-sheet numbers. netRevenue must subtract
// refunds; cumExpected is the "Projected Year Total".
describe("computeTotals", () => {
  it("sums revenue, seats, and payment-method counts", () => {
    const t = computeTotals([
      stat({ revenue: 1000, sold: 5, achCount: 4, cardCount: 1, achRevenue: 800, cardRevenue: 200 }),
      stat({ revenue: 2000, sold: 8, achCount: 6, cardCount: 2, achRevenue: 1600, cardRevenue: 400 }),
    ]);
    expect(t.totalRevenue).toBe(3000);
    expect(t.totalSold).toBe(13);
    expect(t.totalACH).toBe(10);
    expect(t.totalCard).toBe(3);
  });

  it("net revenue subtracts refunds", () => {
    const t = computeTotals([stat({ revenue: 5000, refundAmount: 950, refundCount: 1 })]);
    expect(t.refundTotal).toBe(950);
    expect(t.netRevenue).toBe(4050);
  });

  it("cumExpected = past actual + future projection", () => {
    const past = stat({ isPast: true, revenue: 9500 });
    const future = stat({ isPast: false, sold: 10, remaining: 30, priceAchAmount: 950 }); // 37*950
    const t = computeTotals([past, future], 90);
    expect(t.cumExpected).toBe(9500 + 37 * 950);
  });
});
