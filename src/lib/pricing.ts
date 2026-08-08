/**
 * Pure pricing + capacity helpers shared by the checkout functions and admin views.
 * Kept dependency-free so they're unit-testable without the Stripe SDK.
 */

/** Seats still available for a session. Never negative, even if oversold. */
export function seatsRemaining(maxSeats: number, sold: number): number {
  return Math.max(0, maxSeats - sold);
}

/** A session is sold out when no seats remain. */
export function isSoldOut(maxSeats: number, sold: number): boolean {
  return seatsRemaining(maxSeats, sold) === 0;
}

/**
 * Card price = base price plus a percentage surcharge, rounded to whole units.
 * Mirrors the "3% processing fee" shown on the card payment option.
 */
export function cardPriceFromBase(basePrice: number, surchargePercent: number): number {
  return Math.round(basePrice * (1 + surchargePercent / 100));
}
