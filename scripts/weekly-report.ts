/**
 * Weekly PDF report: a cover sheet with YTD sales + forecast-if-full + seats
 * left per upcoming event, then one page per coaching date (most-recent-first)
 * with that session's attendee table — the same data as the admin dashboard.
 * Emailed weekly via Resend. Run via `tsx`.
 */
import { Resend } from "resend";
import { buildReport } from "./lib/report-data.js";
import { renderPdf } from "./lib/pdf-report.js";

async function main() {
  const recipients = (process.env.EXPORT_RECIPIENTS || "agetz.51@gmail.com")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  // Report date is passed in (GH Action injects it) so output is deterministic.
  const generatedOn = process.env.REPORT_DATE || new Date().toISOString().split("T")[0];

  const { sessions } = await buildReport();
  const pdf = await renderPdf(sessions, generatedOn);
  console.log(`Generated PDF (${sessions.length} session pages, ${pdf.length} bytes)`);

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Great Boss Workshop <workshop@greatbossworkshop.com>",
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    to: recipients,
    subject: `Great Boss Workshop — weekly report (${generatedOn})`,
    text: `Weekly report attached. ${sessions.length} coaching date(s) covered.`,
    attachments: [{ filename: `weekly-report-${generatedOn}.pdf`, content: pdf }],
  });

  if (error) throw new Error(`Resend send failed: ${JSON.stringify(error)}`);
  console.log(`Emailed weekly report to ${recipients.join(", ")}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
