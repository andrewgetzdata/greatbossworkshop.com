import { adminKeyMatches } from "./workshop-webhook.js";

export interface RefundableCharge {
  workshopProduct: string | null | undefined;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
  chargeAmount: number | null;
  amountRefunded: number | null;
  fullyRefunded: boolean;
}

export type RefundDecision =
  | { action: "refund"; paymentIntentId: string }
  | { action: "already_refunded" }
  | { action: "reject"; status: number; error: string };

/**
 * Full remaining refund, or a clean stop when Stripe has already refunded it.
 * Omitting an amount on the Stripe call is what refunds whatever is left.
 */
export function decideRefund(charge: RefundableCharge): RefundDecision {
  if (!charge.workshopProduct) {
    return { action: "reject", status: 404, error: "Not a workshop purchase" };
  }
  if (!charge.paymentIntentId) {
    return { action: "reject", status: 400, error: "This payment cannot be refunded" };
  }
  if (charge.paymentIntentStatus === "canceled") {
    return { action: "reject", status: 409, error: "This payment was canceled" };
  }
  const fullyCovered =
    charge.fullyRefunded ||
    (charge.chargeAmount != null &&
      charge.chargeAmount > 0 &&
      charge.amountRefunded != null &&
      charge.amountRefunded >= charge.chargeAmount);
  if (fullyCovered) return { action: "already_refunded" };
  return { action: "refund", paymentIntentId: charge.paymentIntentId };
}

export function isAlreadyRefundedError(err: unknown): boolean {
  return !!err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "charge_already_refunded";
}

export interface RefundRequestEvent {
  httpMethod: string;
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
}

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handleRefundRequest(
  event: RefundRequestEvent,
  deps: {
    adminKey?: string;
    retrieve: (checkoutSessionId: string) => Promise<RefundableCharge | null>;
    createRefund: (paymentIntentId: string, idempotencyKey: string) => Promise<void>;
    rebuild: () => Promise<void>;
  },
) {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const expected = deps.adminKey ?? process.env.ADMIN_API_KEY;
  const provided = event.queryStringParameters?.key;
  if (!adminKeyMatches(expected, provided)) return json(401, { error: "Unauthorized" });

  let checkoutSessionId = "";
  try {
    const parsed = JSON.parse(event.body || "{}") as { checkoutSessionId?: unknown };
    if (typeof parsed.checkoutSessionId === "string") checkoutSessionId = parsed.checkoutSessionId;
  } catch {
    return json(400, { error: "Invalid request" });
  }
  if (!checkoutSessionId.startsWith("cs_")) return json(400, { error: "Invalid checkout session" });

  const charge = await deps.retrieve(checkoutSessionId);
  if (!charge) return json(404, { error: "Purchase not found" });

  const decision = decideRefund(charge);
  if (decision.action === "reject") return json(decision.status, { error: decision.error });

  let alreadyRefunded = decision.action === "already_refunded";
  if (decision.action === "refund") {
    try {
      await deps.createRefund(decision.paymentIntentId, `workshop-refund-${checkoutSessionId}`);
    } catch (err) {
      if (!isAlreadyRefundedError(err)) throw err;
      alreadyRefunded = true;
    }
  }

  let refreshed = true;
  try {
    await deps.rebuild();
  } catch (err) {
    console.error("Class status rebuild after refund failed:", err);
    refreshed = false;
  }

  return json(200, { ok: true, alreadyRefunded, refreshed });
}
