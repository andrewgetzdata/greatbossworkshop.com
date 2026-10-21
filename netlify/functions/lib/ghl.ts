import { stripe } from "./stripe.js";
import { buildGhlPurchasePayload, type GhlSessionInput } from "../../../src/lib/ghl-payload.js";

/**
 * POST the purchase to the GoHighLevel inbound webhook. Never throws: a CRM
 * outage must not make the Stripe webhook fail (Stripe would retry and
 * re-send the confirmation email).
 */
export async function sendPurchaseToGhl(session: GhlSessionInput): Promise<void> {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) return;

  try {
    const eventName = await getEventName(session.metadata?.workshop_product);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGhlPurchasePayload(session, eventName)),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("GoHighLevel webhook failed:", res.status, session.id);
    }
  } catch (err) {
    console.error("GoHighLevel webhook error:", session.id, err);
  }
}

// Name lives on the Stripe product, not the checkout session. Best-effort so a
// lookup failure doesn't block the CRM push.
async function getEventName(productId: string | undefined): Promise<string> {
  if (!productId) return "";
  try {
    return (await stripe.products.retrieve(productId)).name;
  } catch (err) {
    console.error("Event name lookup failed:", productId, err);
    return "";
  }
}
