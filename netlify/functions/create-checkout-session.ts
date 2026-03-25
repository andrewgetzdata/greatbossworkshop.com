import { stripe, getTicketsSoldForProduct } from "./lib/stripe.js";

export async function handler(event: { httpMethod: string; body: string | null }) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { paymentMethod, productId } = JSON.parse(event.body || "{}");

    if (paymentMethod !== "ach" && paymentMethod !== "card") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payment method" }),
      };
    }

    if (!productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Product ID is required" }),
      };
    }

    // Fetch only the single product instead of all sessions
    const product = await stripe.products.retrieve(productId);

    if (!product.active || product.metadata.workshop_type !== "great_boss") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid or unavailable session" }),
      };
    }

    const sessionDate = product.metadata.session_date;
    const today = new Date().toISOString().split("T")[0];
    if (!sessionDate || sessionDate < today) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid or unavailable session" }),
      };
    }

    const maxSeats = parseInt(product.metadata.max_seats || "25", 10);
    const sold = await getTicketsSoldForProduct(productId);
    const remaining = Math.max(0, maxSeats - sold);

    if (remaining === 0) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "sold_out", remaining: 0 }),
      };
    }

    // Get the right price for the payment method
    const prices = await stripe.prices.list({ product: productId, active: true });
    const priceId = prices.data.find((p) => p.metadata.payment_type === paymentMethod)?.id;
    if (!priceId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No price configured for this payment method" }),
      };
    }

    const dateDisplay = product.metadata.session_display || sessionDate;
    const location = product.metadata.location || "Columbus, OH";
    const venue = product.metadata.venue || "";
    const address = product.metadata.address || "";
    const mapsUrl = product.metadata.maps_url || "";
    const webinarUrl = product.metadata.webinar_url || "";

    const siteUrl = process.env.PUBLIC_SITE_URL || "https://greatbossworkshop.com";

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethod === "ach" ? ["us_bank_account"] : ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}&product=${productId}`,
      cancel_url: `${siteUrl}/#pricing`,
      customer_creation: "always",
      metadata: {
        workshop_product: productId,
        workshop_session_date: sessionDate,
        workshop_session_display: dateDisplay,
        workshop_location: location,
        workshop_venue: venue,
        workshop_address: address,
        workshop_maps_url: mapsUrl,
        workshop_webinar_url: webinarUrl,
      },
      ...(paymentMethod === "ach" && {
        payment_method_options: {
          us_bank_account: {
            verification_method: "instant" as const,
            financial_connections: {
              permissions: ["payment_method" as const],
            },
          },
        },
      }),
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: checkoutSession.url }),
    };
  } catch (err) {
    console.error("Stripe session creation failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
}
