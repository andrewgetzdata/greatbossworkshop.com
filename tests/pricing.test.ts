import { describe, it, expect } from "vitest";
import workshop from "../src/data/workshop.json";
import { seatsRemaining, isSoldOut, cardPriceFromBase } from "../src/lib/pricing";

describe("seat capacity", () => {
  it("reports remaining seats", () => {
    expect(seatsRemaining(40, 10)).toBe(30);
  });

  it("clamps to zero when oversold (never negative)", () => {
    expect(seatsRemaining(25, 30)).toBe(0);
  });

  it("is sold out only when no seats remain", () => {
    expect(isSoldOut(40, 40)).toBe(true);
    expect(isSoldOut(40, 41)).toBe(true);
    expect(isSoldOut(40, 39)).toBe(false);
  });
});

describe("card surcharge", () => {
  it("adds the surcharge percent and rounds", () => {
    // 950 + 3% = 978.5 -> 979
    expect(cardPriceFromBase(950, 3)).toBe(979);
  });

  it("base price with no surcharge is unchanged", () => {
    expect(cardPriceFromBase(950, 0)).toBe(950);
  });
});

describe("workshop.json pricing stays internally consistent", () => {
  it("advertised cardPrice matches base + surcharge (catches copy drift)", () => {
    const { basePrice, cardSurchargePercent, cardPrice } = workshop.pricing;
    expect(cardPriceFromBase(basePrice, cardSurchargePercent)).toBe(cardPrice);
  });
});
