import type Stripe from "stripe";
import { stripe } from "./lib/stripe.js";
import { sendConfirmationEmail } from "./lib/email.js";
import { sendPurchaseToGhl } from "./lib/ghl.js";
import { dispatchWorkshopWebhook } from "../../src/lib/workshop-webhook.js";
import { triggerClassStatusRebuild } from "./lib/trigger-class-status-rebuild.js";

export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string | string[] | undefined>;
  body: string | null;
}) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const sigHeader = event.headers["stripe-signature"];
  const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
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

  await dispatchWorkshopWebhook(stripeEvent, {
    onCheckoutCompleted: async (sessionId) => {
      const session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["customer_details"],
      });
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

      await sendPurchaseToGhl(session);
    },
    triggerClassStatusRebuild: () => triggerClassStatusRebuild(event),
  });

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
}
