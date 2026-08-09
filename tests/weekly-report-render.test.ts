import { describe, it, expect } from "vitest";
import { renderPdf } from "../scripts/lib/pdf-report";
import type { ReportSession } from "../scripts/lib/report-types";

function session(over: Partial<ReportSession>): ReportSession {
  return {
    productId: "p",
    name: "Great Boss Workshop",
    date: "2026-09-01",
    dateDisplay: "September 1, 2026",
    location: "Columbus, OH",
    maxSeats: 25,
    sold: 5,
    remaining: 20,
    isPast: false,
    achCount: 4,
    cardCount: 1,
    achRevenue: 3800,
    cardRevenue: 979,
    revenue: 4779,
    refundCount: 0,
    refundAmount: 0,
    priceAchAmount: 950,
    priceCardAmount: 979,
    attendees: [
      { name: "Jane Doe", email: "jane@x.com", amount: 950, paymentMethod: "ACH", date: "2026-08-01", status: "paid" },
    ],
    ...over,
  };
}

// The PDF render must succeed and produce a real multi-page document. We can't
// assert pixels here, but we can assert it emits a valid, non-trivial PDF for
// the cover + one page per session (visual layout is verified manually).
describe("renderPdf", () => {
  it("produces a valid PDF buffer", async () => {
    const buf = await renderPdf([session({}), session({ isPast: true, date: "2026-04-01" })], "2026-08-11");
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-"); // PDF magic header
  });

  it("handles an empty session list (cover only, no throw)", async () => {
    const buf = await renderPdf([], "2026-08-11");
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("handles a session with no attendees", async () => {
    const buf = await renderPdf([session({ attendees: [], sold: 0, remaining: 25, revenue: 0 })], "2026-08-11");
    expect(buf.length).toBeGreaterThan(1000);
  });
});
