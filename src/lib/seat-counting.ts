/**
 * Pure seat-counting helpers, kept dependency-free so they're unit-testable
 * without the Stripe SDK. The Stripe function layer maps raw checkout sessions
 * onto `CountableSession` and delegates the "does this occupy a seat" and
 * "bucket by product" decisions here.
 */

/** The minimal slice of a completed checkout session needed to count seats. */
export interface CountableSession {
  /** metadata.workshop_product — which workshop this purchase is for. */
  workshopProduct: string | null | undefined;
  /** payment_intent.status — a canceled PI does not occupy a seat. */
  paymentIntentStatus: string | null;
  /** payment_intent.latest_charge.refunded — a refunded charge frees the seat. */
  latestChargeRefunded: boolean;
}

/**
 * True when a completed session still occupies a seat.
 * Mirrors the exclusions in the original getTicketsSoldForProduct: skip
 * canceled payment intents and fully-refunded charges; everything else counts.
 */
export function isSeatOccupied(s: CountableSession): boolean {
  if (s.paymentIntentStatus === "canceled") return false;
  if (s.latestChargeRefunded) return false;
  return true;
}

/**
 * Bucket completed checkout sessions into productId -> occupied-seat count,
 * in a single pass. Sessions with no workshop_product or that don't occupy a
 * seat are ignored.
 */
export function bucketSoldByProduct(sessions: Iterable<CountableSession>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (!s.workshopProduct) continue;
    if (!isSeatOccupied(s)) continue;
    counts.set(s.workshopProduct, (counts.get(s.workshopProduct) ?? 0) + 1);
  }
  return counts;
}
