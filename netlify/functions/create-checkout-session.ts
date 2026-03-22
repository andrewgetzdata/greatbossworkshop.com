import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function handler(event: { httpMethod: string; body: string | null }) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { paymentMethod } = JSON.parse(event.body || "{}");

    if (paymentMethod !== "ach" && paymentMethod !== "card") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid payment method" }),
      };
    }

    const siteUrl = process.env.PUBLIC_SITE_URL || "https://greatbossworkshop.com";
    const priceId =
      paymentMethod === "ach"
        ? process.env.STRIPE_PRICE_ID_ACH
        : process.env.STRIPE_PRICE_ID_CARD;

    if (!priceId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Payment configuration error" }),
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: paymentMethod === "ach" ? ["us_bank_account"] : ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/#pricing`,
      customer_creation: "always",
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
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe session creation failed:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to create checkout session" }),
    };
  }
}
