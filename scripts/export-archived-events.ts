/**
 * Daily past-event attendee export.
 *
 * Lists great_boss workshops whose session_date has passed (< today), regardless
 * of archived status, finds ones not yet exported (dedup against
 * data/seen-archived-events.json), builds a paid-only
 * attendee CSV per new event, and emails them to EXPORT_RECIPIENTS via Resend.
 *
 * Idempotency: the seen-state file is only updated AFTER a successful send, so a
 * failed email never marks an event exported. The GitHub workflow commits the
 * updated file. Run via `tsx` (functions use .js-extension ESM imports).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Resend } from "resend";
import { stripe } from "../netlify/functions/lib/stripe.js";
import { isSeatOccupied } from "../src/lib/seat-counting.js";
import { diffNewEvents } from "../src/lib/archived-dedup.js";
import {
  buildAttendeeRow,
  toCsv,
  type SessionLike,
  type ProductLike,
} from "../src/lib/attendee-csv.js";

const SEEN_PATH = "data/seen-archived-events.json";

function loadSeen(): string[] {
  if (!existsSync(SEEN_PATH)) return [];
  try {
    const parsed = JSON.parse(readFileSync(SEEN_PATH, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "event";
}

/**
 * great_boss products whose session_date is in the past (< today), regardless
 * of whether they've been archived in Stripe yet. Scans both active and
 * archived products so a past event still marked active isn't missed. Dedup
 * (seen-state) guarantees each past event's CSV emails exactly once.
 */
async function listPastWorkshops(): Promise<ProductLike[]> {
  const today = new Date().toISOString().split("T")[0];
  const out: ProductLike[] = [];
  const seenIds = new Set<string>();
  for (const active of [true, false]) {
    for await (const p of stripe.products.list({ active })) {
      if (p.metadata?.workshop_type !== "great_boss") continue;
      const sessionDate = p.metadata?.session_date;
      if (!sessionDate || sessionDate >= today) continue; // only past events
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      out.push({ id: p.id, name: p.name });
    }
  }
  return out;
}

/** Paid (non-refunded, non-canceled) completed checkout sessions for a product. */
async function paidSessionsForProduct(productId: string): Promise<SessionLike[]> {
  const rows: SessionLike[] = [];
  for await (const s of stripe.checkout.sessions.list({
    status: "complete",
    expand: ["data.customer_details", "data.payment_intent", "data.payment_intent.latest_charge"],
  })) {
    if (s.metadata?.workshop_product !== productId) continue;

    const pi = s.payment_intent;
    const piObj = pi && typeof pi === "object" ? pi : null;
    const charge =
      piObj && piObj.latest_charge && typeof piObj.latest_charge === "object"
        ? piObj.latest_charge
        : null;

    // Paid-only: reuse the same exclusion as seat counting.
    const occupied = isSeatOccupied({
      workshopProduct: productId,
      paymentIntentStatus: piObj ? piObj.status : null,
      latestChargeRefunded: charge ? charge.refunded === true : false,
    });
    if (!occupied) continue;

    rows.push({
      metadata: s.metadata,
      customer_details: s.customer_details,
      customer_email: s.customer_email,
    });
  }
  return rows;
}

async function main() {
  const recipients = (process.env.EXPORT_RECIPIENTS || "agetz.51@gmail.com")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  const seen = loadSeen();
  const past = await listPastWorkshops();
  const newIds = diffNewEvents(past.map((p) => p.id), seen);

  if (newIds.length === 0) {
    console.log("No new past events. Nothing to export.");
    return;
  }

  const byId = new Map(past.map((p) => [p.id, p]));
  const attachments: Array<{ filename: string; content: string }> = [];
  const exported: string[] = [];
  const summary: string[] = [];

  for (const id of newIds) {
    const product = byId.get(id)!;
    const sessions = await paidSessionsForProduct(id);
    const records = sessions.map((s) => buildAttendeeRow(s, product));
    const csv = toCsv(records);
    const date = records[0]?.dateAttending ? slugify(records[0].dateAttending) : "";
    attachments.push({
      filename: `attendees-${slugify(product.name)}${date ? "-" + date : ""}.csv`,
      content: Buffer.from(csv, "utf-8").toString("base64"),
    });
    exported.push(id);
    summary.push(`- ${product.name}: ${records.length} paid attendee(s)`);
    console.log(`Built CSV for ${product.name} (${records.length} attendees)`);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Great Boss Workshop <workshop@greatbossworkshop.com>",
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    to: recipients,
    subject: `Great Boss Workshop — attendee export (${exported.length} event${exported.length > 1 ? "s" : ""})`,
    text: `Past workshop attendee CSV(s) attached:\n\n${summary.join("\n")}`,
    attachments,
  });

  if (error) {
    // Do NOT update seen-state — let the next run retry.
    throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  }

  // Only after a successful send: mark these events exported.
  writeFileSync(SEEN_PATH, JSON.stringify([...seen, ...exported], null, 2) + "\n");
  console.log(`Emailed ${exported.length} event(s) to ${recipients.join(", ")}; updated ${SEEN_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
