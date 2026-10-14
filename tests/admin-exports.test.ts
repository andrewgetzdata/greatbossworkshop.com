import { describe, expect, it } from "vitest";
import { CSV_COLUMNS } from "../src/lib/attendee-csv";
import { annualReportCsv, annualSelloutReport } from "../src/lib/annual-report";
import { toClassAttendeeCsv } from "../src/lib/class-attendee-csv";
import { buildClassStatusDocument, type ClassStatusCheckoutInput, type ClassStatusProductInput } from "../src/lib/class-status";
import { forecastSession } from "../src/lib/report-forecast";
import { handleAttendeesRequest } from "../netlify/functions/attendees";

function product(partial: Partial<ClassStatusProductInput> = {}): ClassStatusProductInput {
  return {
    id: "prod_june",
    name: "June 23",
    sessionDate: "2026-06-23",
    dateDisplay: "June 23, 2026",
    location: "Columbus, OH",
    maxSeats: 40,
    priceAchCents: 95000,
    ...partial,
  };
}

function checkout(partial: Partial<ClassStatusCheckoutInput> = {}): ClassStatusCheckoutInput {
  return {
    workshopProduct: "prod_june",
    paymentIntentStatus: "succeeded",
    latestChargeRefunded: false,
    paymentMethodTypes: ["card"],
    amountTotal: 95000,
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    created: Date.parse("2026-05-01T15:00:00Z") / 1000,
    checkoutSessionId: "cs_test_ada",
    firstName: "Ada",
    lastName: "Lovelace",
    company: "Analytical Engines",
    jobTitle: "Programmer",
    phone: "555-0100",
    address1: "1 Note St",
    city: "London",
    state: "OH",
    postalCode: "43085",
    country: "US",
    hasImplementer: "yes",
    implementerName: "Roy Getz",
    wantsMoreInfo: "",
    roleDesc: "Leads the team",
    ...partial,
  };
}

describe("class attendee CSV", () => {
  it("includes every EOS column plus the payment fields, for a future class", () => {
    const doc = buildClassStatusDocument(
      [product(), product({ id: "prod_past", sessionDate: "2026-01-15", dateDisplay: "January 15, 2026" })],
      [
        checkout(),
        checkout({
          workshopProduct: "prod_past",
          checkoutSessionId: "cs_past",
          customerName: "Past Person",
          latestChargeRefunded: true,
        }),
      ],
      "2026-05-02T00:00:00.000Z",
    );

    const june = doc.sessions.find((session) => session.productId === "prod_june")!;
    const csv = toClassAttendeeCsv(june);
    const header = csv.split("\r\n")[0];
    for (const column of CSV_COLUMNS) expect(header).toContain(column.header);
    expect(header).toContain("Amount");
    expect(header).toContain("Payment Method");
    expect(header).toContain("Purchase Date");
    expect(header).toContain("Status");
    expect(csv).toContain("Leads the team");
    expect(csv).toContain("cs_test_ada");
    expect(csv).toContain("June 23, 2026");
    expect(csv).toContain("$950.00");

    const past = doc.sessions.find((session) => session.productId === "prod_past")!;
    expect(toClassAttendeeCsv(past)).toContain("refunded");
  });
});

describe("annual sellout report", () => {
  it("uses the weekly forecast ceiling and sums the gap", () => {
    const doc = buildClassStatusDocument(
      [
        product(),
        product({
          id: "prod_past",
          name: "January",
          sessionDate: "2026-01-15",
          dateDisplay: "January 15, 2026",
          priceAchCents: 100000,
          maxSeats: 10,
        }),
        product({ id: "prod_other_year", sessionDate: "2025-12-01", dateDisplay: "December 1, 2025" }),
      ],
      [
        checkout(),
        checkout({ workshopProduct: "prod_past", amountTotal: 100000, checkoutSessionId: "cs_past" }),
      ],
      "2026-05-02T00:00:00.000Z",
    );

    const report = annualSelloutReport(doc.sessions, "2026", "2026-05-02");
    expect(report.rows.map((row) => row.productId)).toEqual(["prod_past", "prod_june"]);

    const past = report.rows[0];
    const pastSession = doc.sessions.find((session) => session.productId === "prod_past")!;
    const pastForecast = forecastSession({
      productId: pastSession.productId,
      date: pastSession.date,
      dateDisplay: pastSession.dateDisplay,
      location: pastSession.location,
      maxSeats: pastSession.maxSeats,
      sold: pastSession.sold,
      remaining: pastSession.remaining,
      isPast: true,
      achCount: 0,
      cardCount: 0,
      achRevenue: 0,
      cardRevenue: 0,
      revenue: pastSession.revenue,
      refundCount: 0,
      refundAmount: 0,
      priceAchAmount: pastSession.priceAchAmount,
      priceCardAmount: null,
    });
    expect(past.fullSellout).toBe(pastForecast.maxRevenue);
    expect(past.fullSellout).toBe(10 * 1000);
    expect(past.actual).toBe(1000);
    expect(past.gap).toBe(9000);

    const june = report.rows[1];
    expect(june.fullSellout).toBe(40 * 950);
    expect(june.actual).toBe(950);
    expect(june.gap).toBe(june.fullSellout - june.actual);
    expect(report.totalGap).toBe(report.totalFullSellout - report.totalActual);

    const csv = annualReportCsv(report);
    expect(csv.split("\r\n")[0]).toBe("Class,Date,Full sellout,Actual revenue,Gap");
    expect(csv).toContain("Total");
    expect(csv).not.toContain("2025-12-01");
  });
});

describe("attendees export routes", () => {
  it("serves a class CSV and an annual CSV from the blob", async () => {
    const doc = buildClassStatusDocument([product()], [checkout()], "2026-05-02T00:00:00.000Z");
    const deps = {
      adminKey: "secret",
      today: () => "2026-05-02",
      readClassStatus: async () => doc,
    };

    const csv = await handleAttendeesRequest(
      { httpMethod: "GET", queryStringParameters: { key: "secret", product: "prod_june", format: "csv" } },
      deps,
    );
    expect(csv.headers["Content-Type"]).toContain("text/csv");
    expect(csv.body).toContain("cs_test_ada");

    const annual = await handleAttendeesRequest(
      { httpMethod: "GET", queryStringParameters: { key: "secret", format: "annual", year: "2026" } },
      deps,
    );
    expect(annual.body).toContain("38000");
    expect(annual.headers["Content-Disposition"]).toContain("annual-report-2026.csv");

    const empty = await handleAttendeesRequest(
      { httpMethod: "GET", queryStringParameters: { key: "secret", format: "annual", year: "2026" } },
      { ...deps, readClassStatus: async () => null },
    );
    expect(JSON.parse(empty.body)).toEqual({ ready: false });
  });
});
