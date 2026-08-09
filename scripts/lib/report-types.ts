/**
 * Shared report shapes, in a Stripe-free module so the PDF renderer can import
 * them without pulling in the Stripe client (which the data layer instantiates).
 */
import type { SessionStat } from "../../src/lib/report-forecast.js";

export interface AttendeeLine {
  name: string;
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
