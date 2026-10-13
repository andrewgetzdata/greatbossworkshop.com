import type Stripe from "stripe";
import {
  buildClassStatusDocument,
  type ClassStatusCheckoutInput,
  type ClassStatusProductInput,
} from "../../../src/lib/class-status.js";
import { stripe } from "./stripe.js";
import { writeClassStatus } from "./class-status-store.js";

/** Stripe's list default is 10. The rebuild is off the request path, so page at the max. */
const PAGE_SIZE = 100;

type BlobsLambdaEvent = {
  blobs: string;
  headers: Record<string, string>;
};

function productIdOf(price: Stripe.Price): string | null {
  const product = price.product;
  if (typeof product === "string") return product;
  if ("deleted" in product) return null;
  return product.id;
}

function checkoutInput(session: Stripe.Checkout.Session): ClassStatusCheckoutInput {
  const pi = session.payment_intent;
  const piObj = pi && typeof pi === "object" ? pi : null;
  const charge =
    piObj && piObj.latest_charge && typeof piObj.latest_charge === "object"
      ? piObj.latest_charge
      : null;

  return {
    workshopProduct: session.metadata?.workshop_product,
    paymentIntentStatus: piObj ? piObj.status : null,
    latestChargeRefunded: charge ? charge.refunded === true : false,
    paymentMethodTypes: session.payment_method_types ?? [],
    amountTotal: session.amount_total,
    customerName: session.customer_details?.name ?? null,
    customerEmail: session.customer_details?.email || session.customer_email || null,
    created: session.created,
  };
}

/**
 * Full account scan used only to refresh the class-status document.
 * One Checkout Session list: sold, tender, revenue, and attendee rows together.
 */
export async function rebuildClassStatus(event: BlobsLambdaEvent): Promise<void> {
  const achCents = new Map<string, number>();
  for await (const price of stripe.prices.list({ active: true, limit: PAGE_SIZE })) {
    if (price.metadata.payment_type !== "ach" || price.unit_amount == null) continue;
    const productId = productIdOf(price);
    if (productId) achCents.set(productId, price.unit_amount);
  }

  const products: ClassStatusProductInput[] = [];
  for await (const product of stripe.products.list({ active: true, limit: PAGE_SIZE })) {
    if (product.metadata.workshop_type !== "great_boss") continue;
    const sessionDate = product.metadata.session_date;
    if (!sessionDate) continue;
    products.push({
      id: product.id,
      name: product.name,
      sessionDate,
      dateDisplay: product.metadata.session_display || sessionDate,
      location: product.metadata.location || "Columbus, OH",
      maxSeats: parseInt(product.metadata.max_seats || "25", 10),
      priceAchCents: achCents.get(product.id) ?? null,
    });
  }

  const checkouts: ClassStatusCheckoutInput[] = [];
  for await (const session of stripe.checkout.sessions.list({
    status: "complete",
    limit: PAGE_SIZE,
    expand: ["data.payment_intent", "data.payment_intent.latest_charge"],
  })) {
    checkouts.push(checkoutInput(session));
  }

  const doc = buildClassStatusDocument(products, checkouts, new Date().toISOString());
  await writeClassStatus(event, doc);
  console.log(`Class status rebuilt (${doc.sessions.length} sessions)`);
}
