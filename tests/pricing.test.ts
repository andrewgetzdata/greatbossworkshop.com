import { describe, it, expect } from "vitest";
import workshop from "../src/data/workshop.json";
import { seatsRemaining, isSoldOut, cardPriceFromBase } from "../src/lib/pricing";

// Seat capacity is the logic that decides whether a session can still be
// booked. It runs on every checkout (create-checkout-session returns 409 when
// a session is full), so a bug here either oversells a workshop or wrongly
// blocks sales. These tests pin the arithmetic and its boundaries.
describe("seat capacity", () => {
  // Happy path: seats sold subtract from the cap.
  it("reports remaining seats", () => {
    expect(seatsRemaining(40, 10)).toBe(30);
  });

  // Refunds and race conditions can push `sold` past `maxSeats`. Remaining must
  // floor at 0 rather than go negative, or downstream "N spots left" copy and
  // capacity checks break.
  it("clamps to zero when oversold (never negative)", () => {
    expect(seatsRemaining(25, 30)).toBe(0);
  });

  // Sold-out is the 409 trigger. Verify the exact boundary: full and oversold
  // are sold out; one seat short is not.
  it("is sold out only when no seats remain", () => {
    expect(isSoldOut(40, 40)).toBe(true);
    expect(isSoldOut(40, 41)).toBe(true);
    expect(isSoldOut(40, 39)).toBe(false);
  });
});

// The card option advertises a "3% processing fee" on top of the ACH base
// price. This is the math behind that surcharge; it must round to a whole
// dollar the way the displayed price does.
describe("card surcharge", () => {
  // 950 + 3% = 978.5, which must round up to the advertised 979.
  it("adds the surcharge percent and rounds", () => {
    expect(cardPriceFromBase(950, 3)).toBe(979);
  });

  // A 0% surcharge must leave the base untouched (no rounding drift).
  it("base price with no surcharge is unchanged", () => {
    expect(cardPriceFromBase(950, 0)).toBe(950);
  });
});

// workshop.json hardcodes cardPrice (979) alongside basePrice and the surcharge
// percent. Nothing recomputes it, so an editor changing base or percent can
// leave the displayed card price stale. This guards against that drift.
describe("workshop.json pricing stays internally consistent", () => {
  // The advertised cardPrice must equal base + surcharge, or the site shows a
  // price that doesn't match its own stated fee.
  it("advertised cardPrice matches base + surcharge (catches copy drift)", () => {
    const { basePrice, cardSurchargePercent, cardPrice } = workshop.pricing;
    expect(cardPriceFromBase(basePrice, cardSurchargePercent)).toBe(cardPrice);
  });
});
