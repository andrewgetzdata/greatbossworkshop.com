import Stripe from "stripe";
import { seatsRemaining, isSoldOut } from "../../../src/lib/pricing.js";
import { bucketSoldByProduct } from "../../../src/lib/seat-counting.js";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export interface WorkshopSession {
  productId: string;
  date: string;
  dateDisplay: string;
  time: string;
  location: string;
  venue: string;
  address: string;
  mapsUrl: string;
  webinarUrl: string;
  isOnline: boolean;
  maxSeats: number;
  sold: number;
  remaining: number;
  soldOut: boolean;
  isPast: boolean;
  status: "on_sale" | "sold_out" | "past";
  priceAch: string | null;
  priceCard: string | null;
  priceAchAmount: number | null;
  priceCardAmount: number | null;
}

/**
 * Assemble a WorkshopSession from a Stripe product, fetching its prices and
 * reading the sold count from a precomputed soldMap (see getTicketsSoldByProduct).
 */
async function buildSession(
  product: Stripe.Product,
  sessionDate: string,
  isPast: boolean,
  soldMap: Map<string, number>
): Promise<WorkshopSession> {
  const dateDisplay = product.metadata.session_display || sessionDate;
  const time = product.metadata.time || "9:00 AM – 4:00 PM ET";
  const location = product.metadata.location || "Columbus, OH";
  const venue = product.metadata.venue || "";
  const address = product.metadata.address || "";
  const mapsUrl = product.metadata.maps_url || "";
  const webinarUrl = product.metadata.webinar_url || "";
  const isOnline = location.toLowerCase() === "online" || !!webinarUrl;
  const maxSeats = parseInt(product.metadata.max_seats || "25", 10);

  const prices = await stripe.prices.list({ product: product.id, active: true });

  let priceAch: string | null = null;
  let priceCard: string | null = null;
  let priceAchAmount: number | null = null;
  let priceCardAmount: number | null = null;

  for (const price of prices.data) {
    if (price.metadata.payment_type === "ach") {
      priceAch = price.id;
      priceAchAmount = price.unit_amount;
    } else if (price.metadata.payment_type === "card") {
      priceCard = price.id;
      priceCardAmount = price.unit_amount;
    }
  }

  const sold = soldMap.get(product.id) ?? 0;
  const remaining = seatsRemaining(maxSeats, sold);
  const soldOut = isSoldOut(maxSeats, sold);

  return {
    productId: product.id,
    date: sessionDate,
    dateDisplay,
    time,
    location,
    venue,
    address,
    mapsUrl,
    webinarUrl,
    isOnline,
    maxSeats,
    sold,
    remaining,
    soldOut,
    isPast,
    status: isPast ? "past" : soldOut ? "sold_out" : "on_sale",
    priceAch,
    priceCard,
    priceAchAmount,
    priceCardAmount,
  };
}

/**
 * Fetch all upcoming workshop sessions from Stripe products.
 * Products must have metadata: workshop_type=great_boss, session_date, session_display, max_seats.
 * Past sessions (session_date < today) are excluded.
 */
export async function getWorkshopSessions(): Promise<WorkshopSession[]> {
  const today = new Date().toISOString().split("T")[0];

  // One pass over completed checkout sessions for all products (see getTicketsSoldByProduct).
  const soldMap = await getTicketsSoldByProduct();

  // Collect qualifying products first, then build sessions concurrently.
  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ active: true })) {
    if (product.metadata.workshop_type !== "great_boss") continue;
    const sessionDate = product.metadata.session_date;
    if (!sessionDate) continue;
    if (sessionDate < today) continue; // skip past sessions
    products.push(product);
  }

  const sessions = await Promise.all(
    products.map((product) =>
      buildSession(product, product.metadata.session_date!, false, soldMap)
    )
  );

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

/**
 * Fetch all workshop sessions (including past) from Stripe products.
 * Optionally filter by year prefix (e.g. "2026").
 */
export async function getAllWorkshopSessions(year?: string): Promise<WorkshopSession[]> {
  const today = new Date().toISOString().split("T")[0];

  const soldMap = await getTicketsSoldByProduct();

  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ active: true })) {
    if (product.metadata.workshop_type !== "great_boss") continue;
    const sessionDate = product.metadata.session_date;
    if (!sessionDate) continue;
    if (year && !sessionDate.startsWith(year)) continue;
    products.push(product);
  }

  const sessions = await Promise.all(
    products.map((product) => {
      const sessionDate = product.metadata.session_date!;
      return buildSession(product, sessionDate, sessionDate < today, soldMap);
    })
  );

  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

/**
 * Count completed, non-refunded checkout sessions per product in a SINGLE pass.
 * Stripe's checkout-session list has no server-side product filter, so we
 * paginate all completed sessions once and bucket them by the workshop_product
 * metadata set at checkout — instead of re-scanning the whole list per product.
 * Refunded/canceled payments are excluded so their seats become available again.
 */
export async function getTicketsSoldByProduct(): Promise<Map<string, number>> {
  const sessions: Array<{
    workshopProduct: string | null | undefined;
    paymentIntentStatus: string | null;
    latestChargeRefunded: boolean;
  }> = [];

  for await (const session of stripe.checkout.sessions.list({
    status: "complete",
    expand: ["data.payment_intent", "data.payment_intent.latest_charge"],
  })) {
    const pi = session.payment_intent;
    const piObj = pi && typeof pi === "object" ? pi : null;
    const charge =
      piObj && piObj.latest_charge && typeof piObj.latest_charge === "object"
        ? piObj.latest_charge
        : null;

    sessions.push({
      workshopProduct: session.metadata?.workshop_product,
      paymentIntentStatus: piObj ? piObj.status : null,
      latestChargeRefunded: charge ? charge.refunded === true : false,
    });
  }

  return bucketSoldByProduct(sessions);
}

/**
 * Count completed, non-refunded checkout sessions for a specific product.
 * Thin wrapper over getTicketsSoldByProduct so the authoritative oversell gate
 * and the display path share one implementation (no drift). Same one-pass cost.
 */
export async function getTicketsSoldForProduct(productId: string): Promise<number> {
  return (await getTicketsSoldByProduct()).get(productId) ?? 0;
}

/**
 * Get a single session by product ID.
 */
export async function getSessionByProductId(
  productId: string
): Promise<WorkshopSession | null> {
  const sessions = await getWorkshopSessions();
  return sessions.find((s) => s.productId === productId) || null;
}
