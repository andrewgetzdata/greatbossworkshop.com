import { stripe, getAllWorkshopSessions } from "./lib/stripe.js";

export async function handler(event: {
  httpMethod: string;
  queryStringParameters: Record<string, string | undefined> | null;
}) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Auth check
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = event.queryStringParameters?.key;
  if (!adminKey || providedKey !== adminKey) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  const year = event.queryStringParameters?.year || new Date().getFullYear().toString();

  try {
    const sessions = await getAllWorkshopSessions(year);

    // Build per-session stats by scanning checkout sessions
    const sessionStats: Record<string, {
      achCount: number;
      cardCount: number;
      achRevenue: number;
      cardRevenue: number;
      revenue: number;
      refundCount: number;
      refundAmount: number;
    }> = {};
    for (const s of sessions) {
      sessionStats[s.productId] = {
        achCount: 0, cardCount: 0,
        achRevenue: 0, cardRevenue: 0, revenue: 0,
        refundCount: 0, refundAmount: 0,
      };
    }

    const productIds = new Set(sessions.map((s) => s.productId));

    interface RefundRecord {
      sessionDate: string;
      attendeeName: string;
      attendeeEmail: string;
      amount: number;
      refundDate: string;
    }
    const refunds: RefundRecord[] = [];

    for await (const cs of stripe.checkout.sessions.list({
      status: "complete",
      expand: ["data.payment_intent", "data.payment_intent.latest_charge"],
    })) {
      const pid = cs.metadata?.workshop_product;
      if (!pid || !productIds.has(pid)) continue;

      const pi = cs.payment_intent;
      const types = cs.payment_method_types || [];
      const isAch = types.includes("us_bank_account");
      const amount = cs.amount_total || 0;

      // Check if refunded or canceled
      let isRefunded = false;
      let chargeId: string | null = null;
      if (pi && typeof pi === "object") {
        if (pi.status === "canceled") isRefunded = true;
        if (pi.latest_charge && typeof pi.latest_charge === "object") {
          chargeId = pi.latest_charge.id;
          if (pi.latest_charge.refunded) isRefunded = true;
        }
      }

      const stats = sessionStats[pid];

      if (isRefunded) {
        stats.refundCount++;

        // Look up refund details
        if (chargeId) {
          const refundList = await stripe.refunds.list({ charge: chargeId });
          for (const refund of refundList.data) {
            const refundAmountDollars = Math.round(refund.amount / 100);
            stats.refundAmount += refundAmountDollars;

            const session = sessions.find((s) => s.productId === pid);
            refunds.push({
              sessionDate: session?.dateDisplay || "",
              attendeeName: cs.customer_details?.name || "",
              attendeeEmail: cs.customer_details?.email || cs.customer_email || "",
              amount: refundAmountDollars,
              refundDate: new Date(refund.created * 1000).toISOString().split("T")[0],
            });
          }
        }
      } else {
        // Count revenue and payment method
        const amountDollars = Math.round(amount / 100);
        if (isAch) {
          stats.achCount++;
          stats.achRevenue += amountDollars;
        } else {
          stats.cardCount++;
          stats.cardRevenue += amountDollars;
        }
        stats.revenue += amountDollars;
      }
    }

    // Build available years from all products
    const yearSet = new Set<number>();
    for await (const product of stripe.products.list({ active: true })) {
      if (product.metadata.workshop_type !== "great_boss") continue;
      const date = product.metadata.session_date;
      if (date) {
        const y = parseInt(date.substring(0, 4), 10);
        if (!isNaN(y)) yearSet.add(y);
      }
    }
    const availableYears = Array.from(yearSet).sort((a, b) => a - b);

    const result = {
      year: parseInt(year, 10),
      sessions: sessions.map((s) => {
        const stats = sessionStats[s.productId];
        return {
          productId: s.productId,
          date: s.date,
          dateDisplay: s.dateDisplay,
          location: s.location,
          maxSeats: s.maxSeats,
          sold: s.sold,
          remaining: s.remaining,
          isPast: s.isPast,
          achCount: stats.achCount,
          cardCount: stats.cardCount,
          achRevenue: stats.achRevenue,
          cardRevenue: stats.cardRevenue,
          revenue: stats.revenue,
          refundCount: stats.refundCount,
          refundAmount: stats.refundAmount,
          priceAchAmount: s.priceAchAmount ? Math.round(s.priceAchAmount / 100) : null,
          priceCardAmount: s.priceCardAmount ? Math.round(s.priceCardAmount / 100) : null,
        };
      }),
      refunds,
      availableYears,
    };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("Report generation failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to generate report" }),
    };
  }
}
