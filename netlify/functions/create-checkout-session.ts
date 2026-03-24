import { stripe, getWorkshopSessions } from "./lib/stripe.js";

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

    // Fetch sessions and find the matching one
    const sessions = await getWorkshopSessions();
    const session = sessions.find((s) => s.productId === productId);

    if (!session || session.status === "past") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid or unavailable session" }),
      };
    }

    if (session.soldOut) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "sold_out", remaining: 0 }),
      };
    }

    const priceId = paymentMethod === "ach" ? session.priceAch : session.priceCard;
    if (!priceId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "No price configured for this payment method" }),
      };
    }

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
        workshop_session_date: session.date,
        workshop_session_display: session.dateDisplay,
        workshop_location: session.location,
        workshop_venue: session.venue,
        workshop_address: session.address,
        workshop_maps_url: session.mapsUrl,
        workshop_webinar_url: session.webinarUrl,
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
