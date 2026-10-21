import { CSV_COLUMNS } from "./attendee-csv.js";
import type { ClassStatusAttendee, ClassStatusSession } from "./class-status.js";

/** Payment fields the admin already keeps, after the EOS attendee columns. */
const EXTRA_COLUMNS: Array<{ header: string; value: (session: ClassStatusSession, attendee: ClassStatusAttendee) => string }> = [
  { header: "Name", value: (_session, attendee) => attendee.name || "" },
  { header: "Amount", value: (_session, attendee) => attendee.amount },
  { header: "Payment Method", value: (_session, attendee) => attendee.paymentMethod },
  { header: "Purchase Date", value: (_session, attendee) => attendee.date },
  { header: "Status", value: (_session, attendee) => attendee.status },
  { header: "Checkout Session", value: (_session, attendee) => attendee.checkoutSessionId },
];

function eosValue(session: ClassStatusSession, attendee: ClassStatusAttendee, key: string): string {
  switch (key) {
    case "dateAttending":
      return session.dateDisplay || session.date;
    case "eventId":
      return session.productId;
    case "eventName":
      return session.name;
    case "company":
      return attendee.company;
    case "email":
      return attendee.email || "";
    case "firstName":
      return attendee.firstName;
    case "jobTitle":
      return attendee.jobTitle;
    case "lastName":
      return attendee.lastName;
    case "phone":
      return attendee.phone;
    case "homeAddress1":
      return attendee.address1;
    case "homeCity":
      return attendee.city;
    case "homeCountry":
      return attendee.country;
    case "homeState":
      return attendee.state;
    case "homeZip":
      return attendee.postalCode;
    case "hasImplementer":
      return attendee.hasImplementer;
    case "implementerName":
      return attendee.implementerName;
    case "wantsMoreInfo":
      return attendee.wantsMoreInfo;
    case "roleDesc":
      return attendee.roleDesc;
    default:
      return "";
  }
}

function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * One class, every stored attendee field. The EOS columns stay in the same
 * order as the past-event export, then the payment fields the admin page keeps.
 * Includes refunded and canceled rows. Works for any class in the document.
 */
export function toClassAttendeeCsv(session: ClassStatusSession): string {
  const headers = [
    ...CSV_COLUMNS.map((column) => column.header),
    ...EXTRA_COLUMNS.map((column) => column.header),
  ];
  const lines = [headers.map(escapeCell).join(",")];
  for (const attendee of session.attendees) {
    const cells = [
      ...CSV_COLUMNS.map((column) => eosValue(session, attendee, column.key)),
      ...EXTRA_COLUMNS.map((column) => column.value(session, attendee)),
    ];
    lines.push(cells.map(escapeCell).join(","));
  }
  return lines.join("\r\n");
}

export function classAttendeeFilename(session: { date: string; productId: string }): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(session.date) ? session.date : "class";
  const id = session.productId.replace(/[^a-zA-Z0-9_-]/g, "") || "class";
  return `attendees-${date}-${id}.csv`;
}
