import { stripe, getWorkshopSessions } from "./lib/stripe.js";

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

  const productId = event.queryStringParameters?.product;

  try {
    // If no product specified, list all sessions with attendee counts
    if (!productId) {
      const sessions = await getWorkshopSessions();
      const summary = sessions.map((s) => ({
        productId: s.productId,
        date: s.date,
        dateDisplay: s.dateDisplay,
        location: s.location,
        sold: s.sold,
        remaining: s.remaining,
        maxSeats: s.maxSeats,
      }));
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessions: summary }),
      };
    }

    // Get all price IDs for this product
    const prices = await stripe.prices.list({ product: productId, active: true });
    const priceIds = new Set(prices.data.map((p) => p.id));
    const inactivePrices = await stripe.prices.list({ product: productId, active: false });
    inactivePrices.data.forEach((p) => priceIds.add(p.id));

    if (priceIds.size === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Product not found or has no prices" }),
      };
    }

    // Find all completed checkout sessions for this product
    const attendees: Array<{
      name: string | null;
      email: string | null;
      amount: string;
      paymentMethod: string;
      date: string;
      status: string;
    }> = [];

    for await (const session of stripe.checkout.sessions.list({
      status: "complete",
      expand: ["data.customer_details", "data.payment_intent"],
    })) {
      const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
      if (!lineItems.data.some((li) => priceIds.has(li.price?.id ?? ""))) {
        continue;
      }

      // Check refund status
      let paymentStatus = "paid";
      const pi = session.payment_intent;
      if (pi && typeof pi === "object") {
        if (pi.status === "canceled") paymentStatus = "canceled";
        if (
          pi.latest_charge &&
          typeof pi.latest_charge === "object" &&
          pi.latest_charge.refunded
        ) {
          paymentStatus = "refunded";
        }
      }

      const paymentTypes = session.payment_method_types || [];

      attendees.push({
        name: session.customer_details?.name || null,
        email: session.customer_details?.email || session.customer_email,
        amount: session.amount_total
          ? `$${(session.amount_total / 100).toFixed(2)}`
          : "unknown",
        paymentMethod: paymentTypes.includes("us_bank_account") ? "ACH" : "Card",
        date: new Date(session.created * 1000).toISOString().split("T")[0],
        status: paymentStatus,
      });
    }

    // Get product info for context
    const product = await stripe.products.retrieve(productId);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: {
          id: product.id,
          name: product.name,
          sessionDate: product.metadata.session_display || product.metadata.session_date,
          location: product.metadata.location,
        },
        totalAttendees: attendees.filter((a) => a.status === "paid").length,
        attendees,
      }),
    };
  } catch (err) {
    console.error("Attendees lookup failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch attendees" }),
    };
  }
}
