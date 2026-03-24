import type Stripe from "stripe";
import { stripe } from "./lib/stripe.js";
import { sendConfirmationEmail } from "./lib/email.js";

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  body: string | null;
}) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const sig = event.headers["stripe-signature"];
  if (!sig || !event.body) {
    return { statusCode: 400, body: "Missing signature or body" };
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return { statusCode: 400, body: "Invalid signature" };
  }

  switch (stripeEvent.type) {
    case "checkout.session.completed": {
      const session = await stripe.checkout.sessions.retrieve(
        (stripeEvent.data.object as Stripe.Checkout.Session).id,
        { expand: ["customer_details"] }
      );
      console.log(
        "Checkout completed:",
        session.id,
        session.customer_details?.email,
        "date:",
        session.metadata?.workshop_session_date
      );

      await sendConfirmationEmail({
        customer_email: session.customer_email,
        customer_details: session.customer_details,
        amount_total: session.amount_total,
        payment_method_types: session.payment_method_types,
        sessionDate: session.metadata?.workshop_session_date,
        sessionDateDisplay: session.metadata?.workshop_session_display,
        location: session.metadata?.workshop_location,
        venue: session.metadata?.workshop_venue,
        address: session.metadata?.workshop_address,
        mapsUrl: session.metadata?.workshop_maps_url,
        webinarUrl: session.metadata?.workshop_webinar_url,
      });
      break;
    }

    case "checkout.session.async_payment_succeeded": {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      console.log("ACH payment succeeded:", session.id);
      break;
    }

    case "checkout.session.async_payment_failed": {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      console.error("ACH payment failed:", session.id, session.customer_email);
      break;
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
