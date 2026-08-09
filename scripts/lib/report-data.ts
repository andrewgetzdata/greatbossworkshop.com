/**
 * Fetch full report data for the weekly PDF — ALL great_boss sessions including
 * archived and future ones (the admin /report endpoint is active-only), with
 * per-session revenue/refund stats and per-session attendee lists.
 *
 * Reuses the exact stat logic from netlify/functions/report.ts and the sold
 * counting from lib/stripe.ts so the numbers match the admin dashboard.
 */
import Stripe from "stripe";
import { stripe, getTicketsSoldByProduct } from "../../netlify/functions/lib/stripe.js";
import { deriveAttendeeIdentity } from "./report-types.js";
import type { AttendeeLine, ReportSession } from "./report-types.js";

export type { AttendeeLine, ReportSession };

const today = () => new Date().toISOString().split("T")[0];

/** All great_boss products, active and archived, deduped. */
async function listAllWorkshopProducts(): Promise<Stripe.Product[]> {
  const out: Stripe.Product[] = [];
  const seen = new Set<string>();
  for (const active of [true, false]) {
    for await (const p of stripe.products.list({ active })) {
      if (p.metadata?.workshop_type !== "great_boss") continue;
      if (!p.metadata?.session_date) continue;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/**
 * Build the full report: every session (past+future, incl. archived) with stats
 * and attendees, sorted most-recent-first.
 */
export async function buildReport(): Promise<{ sessions: ReportSession[] }> {
  const products = await listAllWorkshopProducts();
  const soldMap = await getTicketsSoldByProduct();
  const productIds = new Set(products.map((p) => p.id));

  const byId = new Map<string, ReportSession>();
  const t = today();
  for (const p of products) {
    const sessionDate = p.metadata.session_date!;
    const maxSeats = parseInt(p.metadata.max_seats || "25", 10);
    const sold = soldMap.get(p.id) ?? 0;
    byId.set(p.id, {
      productId: p.id,
      name: p.name,
      date: sessionDate,
      dateDisplay: p.metadata.session_display || sessionDate,
      location: p.metadata.location || "Columbus, OH",
      maxSeats,
      sold,
      remaining: Math.max(0, maxSeats - sold),
      isPast: sessionDate < t,
      achCount: 0,
      cardCount: 0,
      achRevenue: 0,
      cardRevenue: 0,
      revenue: 0,
      refundCount: 0,
      refundAmount: 0,
      priceAchAmount: null,
      priceCardAmount: null,
      attendees: [],
    });
  }

  // Price amounts (ACH base price drives forecasting).
  for (const p of products) {
    const rs = byId.get(p.id)!;
    const prices = await stripe.prices.list({ product: p.id, active: true });
    for (const price of prices.data) {
      const dollars = price.unit_amount != null ? Math.round(price.unit_amount / 100) : null;
      if (price.metadata.payment_type === "ach") rs.priceAchAmount = dollars;
      else if (price.metadata.payment_type === "card") rs.priceCardAmount = dollars;
    }
  }

  // One scan over completed checkout sessions → per-session stats + attendees.
  for await (const cs of stripe.checkout.sessions.list({
    status: "complete",
    expand: ["data.customer_details", "data.payment_intent", "data.payment_intent.latest_charge"],
  })) {
    const pid = cs.metadata?.workshop_product;
    if (!pid || !productIds.has(pid)) continue;
    const rs = byId.get(pid)!;

    const pi = cs.payment_intent;
    const isAch = (cs.payment_method_types || []).includes("us_bank_account");
    const amountDollars = Math.round((cs.amount_total || 0) / 100);

    let status: AttendeeLine["status"] = "paid";
    let chargeId: string | null = null;
    if (pi && typeof pi === "object") {
      if (pi.status === "canceled") status = "canceled";
      if (pi.latest_charge && typeof pi.latest_charge === "object") {
        chargeId = pi.latest_charge.id;
        if (pi.latest_charge.refunded) status = "refunded";
      }
    }

    if (status === "paid") {
      if (isAch) {
        rs.achCount++;
        rs.achRevenue += amountDollars;
      } else {
        rs.cardCount++;
        rs.cardRevenue += amountDollars;
      }
      rs.revenue += amountDollars;
    } else if (status === "refunded" && chargeId) {
      rs.refundCount++;
      const refundList = await stripe.refunds.list({ charge: chargeId });
      for (const refund of refundList.data) {
        rs.refundAmount += Math.round(refund.amount / 100);
      }
    }

    const identity = deriveAttendeeIdentity({
      metadata: cs.metadata,
      customerName: cs.customer_details?.name,
    });
    rs.attendees.push({
      name: identity.name,
      company: identity.company,
      email: cs.customer_details?.email || cs.customer_email || "",
      amount: amountDollars,
      paymentMethod: isAch ? "ACH" : "Card",
      date: new Date(cs.created * 1000).toISOString().split("T")[0],
      status,
    });
  }

  // Most-recent-first by session date.
  const sessions = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { sessions };
}
