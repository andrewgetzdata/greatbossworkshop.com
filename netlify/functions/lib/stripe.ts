import Stripe from "stripe";

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
 * Fetch all workshop sessions from Stripe products.
 * Products must have metadata: workshop_type=great_boss, session_date, session_display, max_seats
 * Past sessions (session_date < today) are excluded.
 */
export async function getWorkshopSessions(): Promise<WorkshopSession[]> {
  const today = new Date().toISOString().split("T")[0];
  const sessions: WorkshopSession[] = [];

  // Fetch all active products with workshop_type metadata
  for await (const product of stripe.products.list({ active: true })) {
    if (product.metadata.workshop_type !== "great_boss") continue;

    const sessionDate = product.metadata.session_date;
    if (!sessionDate) continue;

    // Skip past sessions
    if (sessionDate < today) continue;

    const isPast = false;
    const dateDisplay = product.metadata.session_display || sessionDate;
    const time = product.metadata.time || "9:00 AM – 4:00 PM ET";
    const location = product.metadata.location || "Columbus, OH";
    const venue = product.metadata.venue || "";
    const address = product.metadata.address || "";
    const mapsUrl = product.metadata.maps_url || "";
    const webinarUrl = product.metadata.webinar_url || "";
    const isOnline = location.toLowerCase() === "online" || !!webinarUrl;
    const maxSeats = parseInt(product.metadata.max_seats || "25", 10);

    // Get prices for this product
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

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

    // Count tickets sold for this product
    const sold = await getTicketsSoldForProduct(product.id);
    const remaining = Math.max(0, maxSeats - sold);

    sessions.push({
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
      soldOut: remaining === 0,
      isPast,
      status: remaining === 0 ? "sold_out" : "on_sale",
      priceAch,
      priceCard,
      priceAchAmount,
      priceCardAmount,
    });
  }

  // Sort by date ascending
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

/**
 * Fetch all workshop sessions (including past) from Stripe products.
 * Optionally filter by year prefix (e.g. "2026").
 */
export async function getAllWorkshopSessions(year?: string): Promise<WorkshopSession[]> {
  const today = new Date().toISOString().split("T")[0];
  const sessions: WorkshopSession[] = [];

  for await (const product of stripe.products.list({ active: true })) {
    if (product.metadata.workshop_type !== "great_boss") continue;

    const sessionDate = product.metadata.session_date;
    if (!sessionDate) continue;

    // Optionally filter by year
    if (year && !sessionDate.startsWith(year)) continue;

    const isPast = sessionDate < today;
    const dateDisplay = product.metadata.session_display || sessionDate;
    const time = product.metadata.time || "9:00 AM – 4:00 PM ET";
    const location = product.metadata.location || "Columbus, OH";
    const venue = product.metadata.venue || "";
    const address = product.metadata.address || "";
    const mapsUrl = product.metadata.maps_url || "";
    const webinarUrl = product.metadata.webinar_url || "";
    const isOnline = location.toLowerCase() === "online" || !!webinarUrl;
    const maxSeats = parseInt(product.metadata.max_seats || "25", 10);

    // Get prices for this product
    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });

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

    // Count tickets sold for this product
    const sold = await getTicketsSoldForProduct(product.id);
    const remaining = Math.max(0, maxSeats - sold);

    sessions.push({
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
      soldOut: remaining === 0,
      isPast,
      status: isPast ? "past" : remaining === 0 ? "sold_out" : "on_sale",
      priceAch,
      priceCard,
      priceAchAmount,
      priceCardAmount,
    });
  }

  // Sort by date ascending
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  return sessions;
}

/**
 * Count completed, non-refunded checkout sessions for a specific product.
 * Refunded payments are excluded so the seat becomes available again.
 */
export async function getTicketsSoldForProduct(productId: string): Promise<number> {
  // Use checkout session metadata to find purchases for this product directly
  // The create-checkout-session endpoint stores workshop_product in metadata
  let count = 0;

  for await (const session of stripe.checkout.sessions.list({
    status: "complete",
    expand: ["data.payment_intent", "data.payment_intent.latest_charge"],
  })) {
    // Filter by product metadata set during checkout
    if (session.metadata?.workshop_product !== productId) continue;

    // Check if payment was fully refunded
    const pi = session.payment_intent;
    if (pi && typeof pi === "object") {
      if (pi.status === "canceled") continue;
      if (
        pi.latest_charge &&
        typeof pi.latest_charge === "object" &&
        pi.latest_charge.refunded
      ) {
        continue;
      }
    }

    count++;
  }
  return count;
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
