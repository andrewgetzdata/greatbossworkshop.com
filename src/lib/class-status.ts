/**
 * Pure class-status document. The Stripe function layer maps products and
 * completed Checkout Sessions into these inputs and writes one JSON document.
 * The admin page reads that document and does not list Checkout Sessions.
 */
import { seatsRemaining } from "./pricing.js";
import { isSeatOccupied } from "./seat-counting.js";

export interface ClassStatusAttendee {
  name: string | null;
  email: string | null;
  amount: string;
  paymentMethod: "ACH" | "Card";
  date: string;
  status: "paid" | "canceled" | "refunded";
}

export interface ClassStatusSession {
  productId: string;
  name: string;
  date: string;
  dateDisplay: string;
  location: string;
  maxSeats: number;
  sold: number;
  remaining: number;
  achCount: number;
  cardCount: number;
  /** Dollars, rounded once from the sum of occupied-seat amounts. */
  revenue: number;
  /** ACH price in dollars, or null when the product has no active ACH price. */
  priceAchAmount: number | null;
  attendees: ClassStatusAttendee[];
}

export interface ClassStatusDocument {
  generatedAt: string;
  sessions: ClassStatusSession[];
}

export interface ClassStatusProductInput {
  id: string;
  name: string;
  sessionDate: string;
  dateDisplay: string;
  location: string;
  maxSeats: number;
  /** Active ACH price in cents, or null. */
  priceAchCents: number | null;
}

export interface ClassStatusCheckoutInput {
  workshopProduct: string | null | undefined;
  paymentIntentStatus: string | null;
  latestChargeRefunded: boolean;
  paymentMethodTypes: string[];
  /** Checkout Session amount_total in cents. */
  amountTotal: number | null;
  customerName: string | null;
  customerEmail: string | null;
  /** Checkout Session created, unix seconds. */
  created: number;
}

export interface AdminSessionSummary {
  productId: string;
  date: string;
  dateDisplay: string;
  location: string;
  sold: number;
  remaining: number;
  maxSeats: number;
  achCount: number;
  cardCount: number;
  revenue: number;
  priceAchAmount: number | null;
}

export function isAchPayment(paymentMethodTypes: string[]): boolean {
  return paymentMethodTypes.includes("us_bank_account");
}

/** Match the previous attendees endpoint: 0 and null both render as unknown. */
export function formatAttendeeAmount(cents: number | null): string {
  if (!cents) return "unknown";
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Canceled is checked first, then refunded overwrites it — same order as the
 * old per-session attendee scan.
 */
export function attendeeStatus(
  checkout: Pick<ClassStatusCheckoutInput, "paymentIntentStatus" | "latestChargeRefunded">,
): ClassStatusAttendee["status"] {
  let status: ClassStatusAttendee["status"] = "paid";
  if (checkout.paymentIntentStatus === "canceled") status = "canceled";
  if (checkout.latestChargeRefunded) status = "refunded";
  return status;
}

export function isClassStatusDocument(value: unknown): value is ClassStatusDocument {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as ClassStatusDocument).sessions);
}

/**
 * One pass over completed checkouts. Sold, ACH vs card, and revenue count only
 * seats that still occupy a place. Refunded and canceled rows stay on the
 * attendee list so the class view can show their status.
 */
export function buildClassStatusDocument(
  products: ClassStatusProductInput[],
  checkouts: Iterable<ClassStatusCheckoutInput>,
  generatedAt: string,
): ClassStatusDocument {
  const byId = new Map<string, ClassStatusSession & { revenueCents: number }>();

  for (const product of products) {
    byId.set(product.id, {
      productId: product.id,
      name: product.name,
      date: product.sessionDate,
      dateDisplay: product.dateDisplay,
      location: product.location,
      maxSeats: product.maxSeats,
      sold: 0,
      remaining: seatsRemaining(product.maxSeats, 0),
      achCount: 0,
      cardCount: 0,
      revenue: 0,
      revenueCents: 0,
      priceAchAmount: product.priceAchCents ? Math.round(product.priceAchCents / 100) : null,
      attendees: [],
    });
  }

  for (const checkout of checkouts) {
    const productId = checkout.workshopProduct;
    if (!productId) continue;
    const row = byId.get(productId);
    if (!row) continue;

    if (isSeatOccupied(checkout)) {
      row.sold += 1;
      if (isAchPayment(checkout.paymentMethodTypes)) row.achCount += 1;
      else row.cardCount += 1;
      row.revenueCents += checkout.amountTotal ?? 0;
    }

    const createdMs = checkout.created * 1000;
    row.attendees.push({
      name: checkout.customerName,
      email: checkout.customerEmail,
      amount: formatAttendeeAmount(checkout.amountTotal),
      paymentMethod: isAchPayment(checkout.paymentMethodTypes) ? "ACH" : "Card",
      date: new Date(createdMs).toISOString().split("T")[0],
      status: attendeeStatus(checkout),
    });
  }

  const sessions = [...byId.values()]
    .map((row) => {
      const { revenueCents, ...session } = row;
      return {
        ...session,
        revenue: Math.round(revenueCents / 100),
        remaining: seatsRemaining(session.maxSeats, session.sold),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { generatedAt, sessions };
}

/** Sidebar payload. Past sessions stay in the document but not on the list. */
export function toAdminSessionList(
  doc: ClassStatusDocument | null,
  today: string,
): { ready: boolean; sessions: AdminSessionSummary[] } {
  if (!isClassStatusDocument(doc)) return { ready: false, sessions: [] };

  const sessions = doc.sessions
    .filter((session) => session.date >= today)
    .map((session) => ({
      productId: session.productId,
      date: session.date,
      dateDisplay: session.dateDisplay,
      location: session.location,
      sold: session.sold,
      remaining: session.remaining,
      maxSeats: session.maxSeats,
      achCount: session.achCount,
      cardCount: session.cardCount,
      revenue: session.revenue,
      priceAchAmount: session.priceAchAmount,
    }));

  return { ready: true, sessions };
}

export type AdminAttendeesResult =
  | { kind: "missing" }
  | { kind: "unknown" }
  | {
      kind: "ok";
      body: {
        ready: true;
        product: { id: string; name: string; sessionDate: string; location: string };
        totalAttendees: number;
        attendees: ClassStatusAttendee[];
      };
    };

export function toAdminAttendees(
  doc: ClassStatusDocument | null,
  productId: string,
): AdminAttendeesResult {
  if (!isClassStatusDocument(doc)) return { kind: "missing" };
  const session = doc.sessions.find((item) => item.productId === productId);
  if (!session) return { kind: "unknown" };
  return {
    kind: "ok",
    body: {
      ready: true,
      product: {
        id: session.productId,
        name: session.name,
        sessionDate: session.dateDisplay,
        location: session.location,
      },
      totalAttendees: session.attendees.filter((attendee) => attendee.status === "paid").length,
      attendees: session.attendees,
    },
  };
}
