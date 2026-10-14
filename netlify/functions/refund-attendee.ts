import type Stripe from "stripe";
import { handleRefundRequest, type RefundableCharge } from "../../src/lib/refund-request.js";
import { rebuildClassStatus } from "./lib/rebuild-class-status.js";
import { stripe } from "./lib/stripe.js";

function toRefundable(session: Stripe.Checkout.Session): RefundableCharge {
  const pi = session.payment_intent;
  const piObj = pi && typeof pi === "object" ? pi : null;
  const charge =
    piObj && piObj.latest_charge && typeof piObj.latest_charge === "object" ? piObj.latest_charge : null;
  return {
    workshopProduct: session.metadata?.workshop_product,
    paymentIntentId: piObj?.id ?? (typeof pi === "string" ? pi : null),
    paymentIntentStatus: piObj ? piObj.status : null,
    chargeAmount: charge ? charge.amount : null,
    amountRefunded: charge ? charge.amount_refunded : null,
    fullyRefunded: charge ? charge.refunded === true : false,
  };
}

/**
 * Full remaining refund for one workshop Checkout Session.
 * Amount is omitted so Stripe refunds whatever is still unrefunded.
 * The class-status document is rebuilt afterward, same data as charge.refunded.
 */
export async function handler(event: {
  httpMethod: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string | undefined> | null;
  body: string | null;
  blobs: string;
}) {
  try {
    return await handleRefundRequest(event, {
      retrieve: async (checkoutSessionId) => {
        try {
          const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
            expand: ["payment_intent.latest_charge"],
          });
          return toRefundable(session);
        } catch (err) {
          const missing = !!err && typeof err === "object" && "statusCode" in err && (err as { statusCode?: number }).statusCode === 404;
          if (missing) return null;
          throw err;
        }
      },
      createRefund: async (paymentIntentId, idempotencyKey) => {
        await stripe.refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey });
      },
      rebuild: () => rebuildClassStatus(event),
    });
  } catch (err) {
    console.error("Refund failed:", err instanceof Error ? err.message : "unknown");
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Refund failed" }),
    };
  }
}
