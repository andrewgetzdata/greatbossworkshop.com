import { Resend } from "resend";
import workshop from "../../../src/data/workshop.json";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM = "Great Boss Workshop <workshop@greatbossworkshop.com>";

function emailFrom(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

// "Name <addr@example.com>" -> "addr@example.com"
function bareAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

// RFC 5545 §3.1: content lines are folded at 75 octets, continuations start with a space.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf-8");
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never split a multi-byte UTF-8 sequence across a fold.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    chunks.push(bytes.subarray(start, end).toString("utf-8"));
    start = end;
    limit = 74; // continuation lines spend one octet on the leading space
  }
  return chunks.join("\r\n ");
}

// Escape a TEXT value (RFC 5545 §3.3.11).
function escText(s: string): string {
  return s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\r?\n/g, "\\n");
}

// CN is a quoted param value; double quotes are not representable inside one.
function escCN(s: string): string {
  return s.replace(/["\\]/g, "").replace(/[\r\n]+/g, " ").trim();
}

type Person = { name?: string | null; email: string };

function generateICS(options: {
  date: string;
  title: string;
  description: string;
  location: string;
  url?: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  method: "REQUEST" | "PUBLISH";
  organizer: Person;
  attendee?: Person;
  sequence?: number;
}): string {
  // Parse the ISO date (e.g. "2026-04-15")
  const [year, month, day] = options.date.split("-");
  const pad = (n: number) => String(n).padStart(2, "0");

  const dtStart = `${year}${month}${day}T${pad(options.startHour)}${pad(options.startMin)}00`;
  const dtEnd = `${year}${month}${day}T${pad(options.endHour)}${pad(options.endMin)}00`;
  const now = new Date();
  const dtStamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const person = (prop: string, p: Person, params: string[] = []) => {
    const all = [...(p.name ? [`CN="${escCN(p.name)}"`] : []), ...params];
    return `${prop}${all.length ? ";" + all.join(";") : ""}:mailto:${p.email}`;
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Great Boss Workshop//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${options.method}`,
    // VTIMEZONE precedes the VEVENT that references it — Outlook is order-sensitive.
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:STANDARD",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `DTSTART;TZID=America/New_York:${dtStart}`,
    `DTEND;TZID=America/New_York:${dtEnd}`,
    `DTSTAMP:${dtStamp}`,
    // Shared UID: every attendee holds one copy of the same event, so a later
    // REQUEST or CANCEL with a higher SEQUENCE updates everyone's calendar.
    `UID:${options.date}-workshop@greatbossworkshop.com`,
    `SEQUENCE:${options.sequence ?? 0}`,
    `SUMMARY:${escText(options.title)}`,
    `DESCRIPTION:${escText(options.description)}`,
    `LOCATION:${escText(options.location)}`,
    person("ORGANIZER", options.organizer),
  ];

  if (options.attendee) {
    lines.push(
      person("ATTENDEE", options.attendee, [
        "CUTYPE=INDIVIDUAL",
        "ROLE=REQ-PARTICIPANT",
        "PARTSTAT=NEEDS-ACTION",
        "RSVP=TRUE",
      ]),
    );
  }

  if (options.url) {
    lines.push(`URL:${options.url}`);
  }

  lines.push(
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Great Boss Workshop tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  );

  return lines.map(foldLine).join("\r\n");
}

export async function sendConfirmationEmail(session: {
  customer_email: string | null;
  customer_details?: { email: string | null; name: string | null } | null;
  amount_total: number | null;
  payment_method_types?: string[];
  sessionDate?: string;
  sessionDateDisplay?: string;
  location?: string;
  venue?: string;
  address?: string;
  mapsUrl?: string;
  webinarUrl?: string;
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
  const isOnline = session.location?.toLowerCase() === "online" || !!session.webinarUrl;

  // Build location HTML based on in-person vs online
  let locationHtml: string;
  if (isOnline && session.webinarUrl) {
    locationHtml = `<a href="${session.webinarUrl}" style="color:#f97316;text-decoration:none;">Online — Join link will be sent before the workshop</a>`;
  } else if (isOnline) {
    locationHtml = "Online — Join link will be sent before the workshop";
  } else {
    const parts = [session.venue, session.address].filter(Boolean).join(", ");
    const locationText = parts || session.location || "See your confirmation for details";
    if (session.mapsUrl) {
      locationHtml = `<a href="${session.mapsUrl}" style="color:#f97316;text-decoration:none;">${locationText}</a>`;
    } else {
      locationHtml = locationText;
    }
  }

  // Generate the calendar invite if we have a date
  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }> = [];
  if (session.sessionDate) {
    const icsLocation = isOnline
      ? session.webinarUrl || "Online"
      : [session.venue, session.address].filter(Boolean).join(", ") || session.location || "";

    const icsContent = generateICS({
      date: session.sessionDate,
      title: workshop.title,
      description: `${workshop.title} with ${workshop.instructor.name}, ${workshop.instructor.title}. Full-day leadership workshop.`,
      location: icsLocation,
      url: isOnline ? session.webinarUrl : session.mapsUrl,
      startHour: 9,
      startMin: 0,
      endHour: 16,
      endMin: 0,
      method: "REQUEST",
      organizer: {
        name: process.env.CALENDAR_ORGANIZER_NAME || workshop.instructor.name,
        // RSVP replies are delivered here, so it must be a mailbox someone reads.
        email:
          process.env.CALENDAR_ORGANIZER_EMAIL || bareAddress(emailFrom()),
      },
      attendee: { name: session.customer_details?.name, email },
    });

    attachments.push({
      filename: "great-boss-workshop.ics",
      content: Buffer.from(icsContent, "utf-8"),
      // The method parameter is what makes mail clients render RSVP controls
      // instead of treating this as a plain file download.
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
    });
  }

  await resend.emails.send({
    from: emailFrom(),
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    to: email,
    subject: `You're registered for the ${workshop.title} on ${dateDisplay}!`,
    attachments,
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
          <td style="padding:8px 0;">${locationHtml}</td>
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
      <li style="margin-bottom:8px;">${isOnline
        ? "<strong>RSVP</strong> — accept the attached calendar invite; the webinar link follows before the workshop."
        : "<strong>RSVP</strong> — accept the attached calendar invite to confirm your seat and add it to your calendar."
      }</li>
      <li><strong>Come ready to learn</strong> — bring an open mind.${isOnline ? "" : " All materials, workbooks, and lunch are provided."}</li>
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
