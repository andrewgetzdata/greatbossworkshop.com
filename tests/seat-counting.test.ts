import { describe, it, expect } from "vitest";
import { isSeatOccupied, bucketSoldByProduct, type CountableSession } from "../src/lib/seat-counting";

// A helper to build a countable session tersely in tests.
function s(partial: Partial<CountableSession>): CountableSession {
  return {
    workshopProduct: "prod_a",
    paymentIntentStatus: "succeeded",
    latestChargeRefunded: false,
    ...partial,
  };
}

// isSeatOccupied encodes exactly which completed sessions still hold a seat.
// It's the rule that decides sold counts and therefore sold-out state, so its
// two exclusions (canceled PI, refunded charge) must match Stripe's semantics.
describe("isSeatOccupied", () => {
  // A normal paid, non-refunded session holds a seat.
  it("counts a normal completed session", () => {
    expect(isSeatOccupied(s({}))).toBe(true);
  });

  // A canceled payment intent released the funds — the seat is not held.
  it("excludes a canceled payment intent", () => {
    expect(isSeatOccupied(s({ paymentIntentStatus: "canceled" }))).toBe(false);
  });

  // A refunded charge frees the seat so it can be resold.
  it("excludes a refunded charge", () => {
    expect(isSeatOccupied(s({ latestChargeRefunded: true }))).toBe(false);
  });

  // Unexpanded/absent payment_intent (status null) still counts — parity with
  // the original code, which only excluded on an explicit canceled/refunded.
  it("counts when payment_intent status is unknown/null", () => {
    expect(isSeatOccupied(s({ paymentIntentStatus: null }))).toBe(true);
  });
});

// bucketSoldByProduct is the one-pass replacement for scanning all sessions
// once per product. It must attribute each occupied seat to the right product
// and ignore anything that shouldn't count.
describe("bucketSoldByProduct", () => {
  // Seats bucket independently per product.
  it("buckets seats by product", () => {
    const map = bucketSoldByProduct([
      s({ workshopProduct: "prod_a" }),
      s({ workshopProduct: "prod_a" }),
      s({ workshopProduct: "prod_b" }),
    ]);
    expect(map.get("prod_a")).toBe(2);
    expect(map.get("prod_b")).toBe(1);
  });

  // Sessions with no workshop_product (non-workshop purchases) are ignored.
  it("ignores sessions with no workshop_product", () => {
    const map = bucketSoldByProduct([
      s({ workshopProduct: null }),
      s({ workshopProduct: undefined }),
      s({ workshopProduct: "prod_a" }),
    ]);
    expect(map.get("prod_a")).toBe(1);
    expect(map.size).toBe(1);
  });

  // Refunded/canceled sessions don't increment their product's count.
  it("does not count refunded or canceled sessions", () => {
    const map = bucketSoldByProduct([
      s({ workshopProduct: "prod_a", latestChargeRefunded: true }),
      s({ workshopProduct: "prod_a", paymentIntentStatus: "canceled" }),
      s({ workshopProduct: "prod_a" }),
    ]);
    expect(map.get("prod_a")).toBe(1);
  });

  // Empty input yields an empty map (no session scheduled / no sales yet).
  it("returns an empty map for no sessions", () => {
    expect(bucketSoldByProduct([]).size).toBe(0);
  });
});
