import { describe, it, expect } from "vitest";
import {
  forecastSession,
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

// forecastSession must reproduce the admin dashboard's per-session math.
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

  it("maxRemaining = actual + every remaining seat (future); just actual (past)", () => {
    // future: $2937 booked + 22 remaining * 950
    const fut = forecastSession(stat({ isPast: false, revenue: 2937, remaining: 22, priceAchAmount: 950 }));
    expect(fut.maxRemaining).toBe(2937 + 22 * 950);
    // past: no remaining seats → just the actual revenue
    const past = forecastSession(stat({ isPast: true, revenue: 5904 }));
    expect(past.maxRemaining).toBe(5904);
  });

  it("defaults to a 90% fill rate", () => {
    expect(DEFAULT_FILL_RATE).toBe(90);
    const f = forecastSession(stat({ isPast: false, sold: 0, remaining: 10 }));
    expect(f.expected).toBe(Math.round(10 * 0.9) * 950); // 9 * 950
  });
});
