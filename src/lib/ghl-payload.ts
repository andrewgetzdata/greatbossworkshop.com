/**
 * Builds the JSON body we POST to the GoHighLevel inbound webhook for each
 * purchase. Pure + dependency-free (takes a structural subset of the Stripe
 * Checkout Session) so vitest can exercise it without the Stripe SDK.
 *
 * Deliberately excludes anything payment-instrument related (card/bank
 * details), billing address, or amounts — only contact, attendee, event
 * name/date, and the Stripe order id.
 */

export interface GhlSessionInput {
  id: string;
  customer_email?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
}

export interface GhlPurchasePayload {
  event: "purchase";
  stripe_checkout_session_id: string;

  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  role_description: string;
  event_name: string; // Stripe product name
  workshop_session_date: string; // event date, YYYY-MM-DD
  stripe_product_id: string;
  // Blank until UTM capture is wired into checkout metadata.
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

export function buildGhlPurchasePayload(
  session: GhlSessionInput,
  eventName = ""
): GhlPurchasePayload {
  const m = session.metadata ?? {};
  const d = session.customer_details;

  return {
    event: "purchase",
    stripe_checkout_session_id: session.id,

    first_name: m.attendee_first_name ?? "",
    last_name: m.attendee_last_name ?? "",
    email: d?.email ?? session.customer_email ?? "",
    phone: d?.phone ?? "",
    company: m.attendee_company ?? "",
    job_title: m.attendee_job_title ?? "",
    role_description: m.attendee_role_desc ?? "",

    event_name: eventName,
    workshop_session_date: m.workshop_session_date ?? "",
    stripe_product_id: m.workshop_product ?? "",
    utm_source: m.utm_source ?? "",
    utm_medium: m.utm_medium ?? "",
    utm_campaign: m.utm_campaign ?? "",
    utm_term: m.utm_term ?? "",
    utm_content: m.utm_content ?? "",
  };
}
