/**
 * Shared report shapes, in a Stripe-free module so the PDF renderer can import
 * them without pulling in the Stripe client (which the data layer instantiates).
 */
import type { SessionStat } from "../../src/lib/report-forecast.js";

export interface AttendeeLine {
  name: string;
  company: string;
  email: string;
  amount: number; // whole dollars
  paymentMethod: "ACH" | "Card";
  date: string; // YYYY-MM-DD (checkout created)
  status: "paid" | "refunded" | "canceled";
}

export interface ReportSession extends SessionStat {
  name: string; // product/event name
  attendees: AttendeeLine[];
}

/**
 * Derive an attendee's display name + company from checkout-session data.
 * Prefer the registration form's explicit first/last name (accurate) over
 * Stripe's single customer name field; company comes from the form metadata.
 * Pure so the mapping is unit-testable without the Stripe SDK.
 */
export function deriveAttendeeIdentity(input: {
  metadata: Record<string, string | null | undefined> | null | undefined;
  customerName?: string | null;
}): { name: string; company: string } {
  const m = input.metadata ?? {};
  const first = (m.attendee_first_name || "").toString().trim();
  const last = (m.attendee_last_name || "").toString().trim();
  const formName = [first, last].filter(Boolean).join(" ");
  return {
    name: formName || (input.customerName || "").trim(),
    company: (m.attendee_company || "").toString().trim(),
  };
}
