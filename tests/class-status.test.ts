import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bucketSoldByProduct } from "../src/lib/seat-counting";
import {
  buildClassStatusDocument,
  toAdminAttendees,
  toAdminSessionList,
  type ClassStatusCheckoutInput,
  type ClassStatusProductInput,
} from "../src/lib/class-status";

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
    ...partial,
  };
}

describe("buildClassStatusDocument", () => {
  it("counts sold, ACH vs card, and revenue in one pass", () => {
    const checkouts = [
      checkout({ paymentMethodTypes: ["us_bank_account"], amountTotal: 95000 }),
      checkout({
        paymentMethodTypes: ["card"],
        amountTotal: 97850,
        customerName: "Grace Hopper",
        customerEmail: "grace@example.com",
      }),
      checkout({
        workshopProduct: "prod_sept",
        paymentMethodTypes: ["card"],
        amountTotal: 149,
      }),
      checkout({
        workshopProduct: "prod_sept",
        paymentMethodTypes: ["card"],
        amountTotal: 149,
      }),
    ];

    const doc = buildClassStatusDocument(
      [
        product(),
        product({
          id: "prod_sept",
          name: "September 22",
          sessionDate: "2026-09-22",
          dateDisplay: "September 22, 2026",
          priceAchCents: null,
        }),
      ],
      checkouts,
      "2026-05-02T00:00:00.000Z",
    );

    expect(doc.generatedAt).toBe("2026-05-02T00:00:00.000Z");
    expect(doc.sessions.map((session) => session.productId)).toEqual(["prod_june", "prod_sept"]);

    const june = doc.sessions[0];
    expect(june.sold).toBe(2);
    expect(june.remaining).toBe(38);
    expect(june.achCount).toBe(1);
    expect(june.cardCount).toBe(1);
    expect(june.revenue).toBe(Math.round((95000 + 97850) / 100));
    expect(june.priceAchAmount).toBe(950);
    expect(june.attendees.map((attendee) => attendee.paymentMethod)).toEqual(["ACH", "Card"]);
    expect(june.attendees[0]).toMatchObject({
      name: "Ada Lovelace",
      email: "ada@example.com",
      amount: "$950.00",
      status: "paid",
      date: "2026-05-01",
    });

    const sept = doc.sessions[1];
    // 149 + 149 cents round once to $3, not $1 + $1.
    expect(sept.revenue).toBe(3);
    expect(sept.priceAchAmount).toBeNull();
    expect(sept.sold).toBe(2);

    const sold = bucketSoldByProduct(checkouts);
    expect(june.sold).toBe(sold.get("prod_june"));
    expect(sept.sold).toBe(sold.get("prod_sept"));
  });

  it("keeps refunded and canceled attendees but does not sell their seats", () => {
    const doc = buildClassStatusDocument(
      [product({ maxSeats: 40 })],
      [
        checkout(),
        checkout({
          latestChargeRefunded: true,
          paymentIntentStatus: "succeeded",
          customerName: "Refunded Person",
          amountTotal: 95000,
        }),
        checkout({
          paymentIntentStatus: "canceled",
          customerName: "Canceled Person",
        }),
      ],
      "2026-05-02T00:00:00.000Z",
    );

    const session = doc.sessions[0];
    expect(session.sold).toBe(1);
    expect(session.remaining).toBe(39);
    expect(session.revenue).toBe(950);
    expect(session.cardCount).toBe(1);
    expect(session.attendees.map((attendee) => attendee.status)).toEqual([
      "paid",
      "refunded",
      "canceled",
    ]);
  });

  it("ignores checkouts that are not for a known workshop product", () => {
    const doc = buildClassStatusDocument(
      [product()],
      [checkout({ workshopProduct: null }), checkout({ workshopProduct: "prod_other" })],
      "2026-05-02T00:00:00.000Z",
    );
    expect(doc.sessions[0].sold).toBe(0);
    expect(doc.sessions[0].attendees).toEqual([]);
  });

  it("lets a refunded status win when the payment intent is also canceled", () => {
    const doc = buildClassStatusDocument(
      [product()],
      [checkout({ paymentIntentStatus: "canceled", latestChargeRefunded: true })],
      "2026-05-02T00:00:00.000Z",
    );
    expect(doc.sessions[0].attendees[0].status).toBe("refunded");
    expect(doc.sessions[0].sold).toBe(0);
  });
});

describe("admin reads of the class-status document", () => {
  const doc = buildClassStatusDocument(
    [
      product({ sessionDate: "2026-04-01", dateDisplay: "April 1, 2026", id: "prod_past" }),
      product(),
    ],
    [checkout(), checkout({ workshopProduct: "prod_past", customerName: "Past Person" })],
    "2026-05-02T00:00:00.000Z",
  );

  it("lists every class, including past ones, and reports a missing document", () => {
    expect(toAdminSessionList(null, "2026-05-02")).toEqual({ ready: false, sessions: [] });
    expect(toAdminSessionList({ generatedAt: "x" } as never, "2026-05-02")).toEqual({
      ready: false,
      sessions: [],
    });

    const list = toAdminSessionList(doc, "2026-05-02");
    expect(list.ready).toBe(true);
    expect(list.sessions.map((session) => session.productId)).toEqual(["prod_past", "prod_june"]);
    expect(list.sessions[0].isPast).toBe(true);
    expect(list.sessions[1].isPast).toBe(false);
    expect(list.sessions[0]).not.toHaveProperty("attendees");
  });

  it("returns attendee rows for one class from the same document", () => {
    expect(toAdminAttendees(null, "prod_june").kind).toBe("missing");
    expect(toAdminAttendees(doc, "prod_missing").kind).toBe("unknown");

    const result = toAdminAttendees(doc, "prod_june");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.body.totalAttendees).toBe(1);
    expect(result.body.attendees[0].name).toBe("Ada Lovelace");
    expect(result.body.product.sessionDate).toBe("June 23, 2026");
  });
});

describe("page-load functions do not list Checkout Sessions", () => {
  it("keeps the full scan in the rebuild only", () => {
    const attendees = readFileSync("netlify/functions/attendees.ts", "utf8");
    expect(attendees).not.toContain("checkout.sessions");
    expect(attendees).not.toContain("getWorkshopSessions");
    expect(attendees).not.toContain("listLineItems");

    const rebuild = readFileSync("netlify/functions/lib/rebuild-class-status.ts", "utf8");
    expect(rebuild.match(/checkout\.sessions\.list/g)).toHaveLength(1);
    expect(rebuild).toContain("limit: PAGE_SIZE");
    expect(rebuild).toContain("const PAGE_SIZE = 100");
  });
});
