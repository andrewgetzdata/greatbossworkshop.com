import { Resend } from "resend";
import workshop from "../../../src/data/workshop.json";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendConfirmationEmail(session: {
  customer_email: string | null;
  customer_details?: { email: string | null; name: string | null } | null;
  amount_total: number | null;
  payment_method_types?: string[];
  sessionDateDisplay?: string;
}) {
  const email = session.customer_details?.email || session.customer_email;
  if (!email) {
    console.warn("No customer email on session, skipping confirmation");
    return;
  }

  const name = session.customer_details?.name || "there";
  const amount = session.amount_total
    ? `$${(session.amount_total / 100).toFixed(2)}`
    : "See your Stripe receipt";

  const dateDisplay = session.sessionDateDisplay || "See your confirmation for details";

  const locationLine = `${workshop.location.name}, ${workshop.location.address}, ${workshop.location.city}, ${workshop.location.state} ${workshop.location.zip}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Great Boss Workshop <workshop@greatbossworkshop.com>",
    to: email,
    subject: `You're registered for the ${workshop.title} on ${dateDisplay}!`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;background:#f9fafb;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;padding-bottom:24px;border-bottom:2px solid #f97316;">
      <h1 style="margin:0;font-size:24px;color:#1a1a1a;">You're Registered!</h1>
      <p style="margin:8px 0 0;color:#6b7280;font-size:16px;">Welcome to the ${workshop.title}</p>
    </div>

    <p style="margin:24px 0 0;font-size:16px;line-height:1.6;">
      Hi ${name},
    </p>
    <p style="margin:12px 0 0;font-size:16px;line-height:1.6;">
      Thank you for registering! We're excited to have you join us. Here are your workshop details:
    </p>

    <div style="margin:24px 0;padding:20px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;font-weight:500;vertical-align:top;width:90px;">Date</td>
          <td style="padding:8px 0;font-weight:600;">${dateDisplay}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;font-weight:500;vertical-align:top;">Time</td>
          <td style="padding:8px 0;">${workshop.time}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;font-weight:500;vertical-align:top;">Location</td>
          <td style="padding:8px 0;">
            <a href="${workshop.location.mapsUrl}" style="color:#f97316;text-decoration:none;">${locationLine}</a>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;font-weight:500;vertical-align:top;">Instructor</td>
          <td style="padding:8px 0;">${workshop.instructor.name}, ${workshop.instructor.title}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;font-weight:500;vertical-align:top;">Amount</td>
          <td style="padding:8px 0;">${amount}</td>
        </tr>
      </table>
    </div>

    <h2 style="margin:28px 0 12px;font-size:18px;">What's Next</h2>
    <ol style="margin:0;padding:0 0 0 20px;font-size:15px;line-height:1.8;">
      <li style="margin-bottom:8px;"><strong>Check your email</strong> for a payment receipt from Stripe.</li>
      <li style="margin-bottom:8px;"><strong>Calendar invite</strong> — you'll receive one with all the details shortly.</li>
      <li><strong>Come ready to learn</strong> — bring an open mind. All materials, workbooks, and lunch are provided.</li>
    </ol>

    <div style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:13px;text-align:center;">
      <p style="margin:0;">
        ${workshop.title} &middot; Led by ${workshop.instructor.name}
      </p>
      <p style="margin:8px 0 0;">
        Questions? Reply to this email.
      </p>
    </div>
  </div>
</body>
</html>
    `.trim(),
  });

  console.log("Confirmation email sent to", email, "for session", dateDisplay);
}
