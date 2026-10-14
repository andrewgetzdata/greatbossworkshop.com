/**
 * What the Stripe webhook does after the signature has been verified.
 * Email runs to completion before the class-status rebuild is triggered, and
 * a failed trigger does not fail the webhook (that would resend the email).
 */

export interface WorkshopWebhookEvent {
  type: string;
  data: {
    object: object;
  };
}

function objectField(object: object, key: string): string | null | undefined {
  if (!(key in object)) return undefined;
  const value = (object as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (value == null) return null;
  return undefined;
}

export interface WorkshopWebhookDeps {
  onCheckoutCompleted: (sessionId: string) => Promise<void>;
  triggerClassStatusRebuild: () => Promise<void>;
}

const REBUILD_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "charge.refunded",
  "product.created",
  "product.updated",
]);

export function classStatusRebuildUrl(input: {
  host?: string;
  forwardedProto?: string;
  deployPrimeUrl?: string;
  siteUrl?: string;
}): string | null {
  const path = "/.netlify/functions/rebuild-class-status-background";
  if (input.host) {
    const forwarded = (input.forwardedProto || "").split(",")[0].trim();
    const proto =
      forwarded ||
      (input.host.startsWith("localhost") || input.host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${input.host}${path}`;
  }
  const base = (input.deployPrimeUrl || input.siteUrl || "").replace(/\/$/, "");
  if (!base) return null;
  return `${base}${path}`;
}

export function adminKeyMatches(expected: string | undefined, provided: string | undefined): boolean {
  if (!expected || provided == null) return false;
  return provided === expected;
}

async function safeRebuild(trigger: () => Promise<void>): Promise<void> {
  try {
    await trigger();
  } catch (err) {
    console.error("Class status rebuild trigger failed:", err);
  }
}

export async function dispatchWorkshopWebhook(
  event: WorkshopWebhookEvent,
  deps: WorkshopWebhookDeps,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const sessionId = objectField(event.data.object, "id");
      if (sessionId) await deps.onCheckoutCompleted(sessionId);
      await safeRebuild(deps.triggerClassStatusRebuild);
      break;
    }
    case "charge.refunded":
    case "product.created":
    case "product.updated": {
      await safeRebuild(deps.triggerClassStatusRebuild);
      break;
    }
    case "checkout.session.async_payment_succeeded": {
      console.log("ACH payment succeeded:", objectField(event.data.object, "id"));
      break;
    }
    case "checkout.session.async_payment_failed": {
      console.error(
        "ACH payment failed:",
        objectField(event.data.object, "id"),
        objectField(event.data.object, "customer_email"),
      );
      break;
    }
    default:
      break;
  }
}

export function webhookRebuildsClassStatus(eventType: string): boolean {
  return REBUILD_EVENT_TYPES.has(eventType);
}
