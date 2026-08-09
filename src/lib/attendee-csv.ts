/**
 * Pure helpers to turn Stripe checkout sessions + product into attendee CSV rows.
 * Dependency-free (no Stripe SDK) so it's unit-testable — the export script maps
 * real Stripe objects onto these plain shapes.
 */

/** Minimal slice of a completed checkout session the row builder needs. */
export interface SessionLike {
  metadata: Record<string, string | null | undefined> | null;
  customer_details: {
    email?: string | null;
    phone?: string | null;
    address?: {
      line1?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      country?: string | null;
    } | null;
  } | null;
  customer_email?: string | null;
}

/** Minimal slice of the workshop product. */
export interface ProductLike {
  id: string;
  name: string;
}

/** One attendee row — 18 columns in a fixed order (see CSV_COLUMNS). */
export interface AttendeeRecord {
  dateAttending: string;
  eventId: string;
  eventName: string;
  company: string;
  email: string;
  firstName: string;
  jobTitle: string;
  lastName: string;
  phone: string;
  homeAddress1: string;
  homeCity: string;
  homeCountry: string;
  homeState: string;
  homeZip: string;
  hasImplementer: string;
  implementerName: string;
  wantsMoreInfo: string;
  roleDesc: string;
}

/** Column order + human headers for the CSV (matches the EOS field list). */
export const CSV_COLUMNS: Array<{ key: keyof AttendeeRecord; header: string }> = [
  { key: "dateAttending", header: "Date Attending" },
  { key: "eventId", header: "Event ID" },
  { key: "eventName", header: "Event Name" },
  { key: "company", header: "Company" },
  { key: "email", header: "Email" },
  { key: "firstName", header: "First Name" },
  { key: "jobTitle", header: "Job Title" },
  { key: "lastName", header: "Last Name" },
  { key: "phone", header: "Phone" },
  { key: "homeAddress1", header: "Home Address 1" },
  { key: "homeCity", header: "Home City" },
  { key: "homeCountry", header: "Home Country" },
  { key: "homeState", header: "Home State" },
  { key: "homeZip", header: "Home Zip" },
  { key: "hasImplementer", header: "Working with an EOS Implementer?" },
  { key: "implementerName", header: "Implementer's Name" },
  { key: "wantsMoreInfo", header: "Wants to Learn More About EOS?" },
  { key: "roleDesc", header: "Please describe your role" },
];

function m(session: SessionLike, key: string): string {
  return session.metadata?.[key]?.toString() ?? "";
}

/**
 * Build one attendee record from a checkout session + its product.
 * Form fields come from session metadata (attendee_*); email/phone/address come
 * from Stripe's native customer_details; event fields from the product/metadata.
 */
export function buildAttendeeRow(session: SessionLike, product: ProductLike): AttendeeRecord {
  const addr = session.customer_details?.address ?? {};
  return {
    dateAttending: m(session, "workshop_session_display") || m(session, "workshop_session_date"),
    eventId: product.id,
    eventName: product.name,
    company: m(session, "attendee_company"),
    email: session.customer_details?.email ?? session.customer_email ?? "",
    firstName: m(session, "attendee_first_name"),
    jobTitle: m(session, "attendee_job_title"),
    lastName: m(session, "attendee_last_name"),
    phone: session.customer_details?.phone ?? "",
    homeAddress1: addr.line1 ?? "",
    homeCity: addr.city ?? "",
    homeCountry: addr.country ?? "",
    homeState: addr.state ?? "",
    homeZip: addr.postal_code ?? "",
    hasImplementer: m(session, "attendee_has_implementer"),
    implementerName: m(session, "attendee_implementer_name"),
    wantsMoreInfo: m(session, "attendee_wants_more_info"),
    roleDesc: m(session, "attendee_role_desc"),
  };
}

/** RFC-4180 escaping: quote when a field contains comma, quote, CR, or LF. */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize attendee records to a CSV string with a header row. */
export function toCsv(records: AttendeeRecord[]): string {
  const header = CSV_COLUMNS.map((c) => escapeCell(c.header)).join(",");
  const rows = records.map((rec) =>
    CSV_COLUMNS.map((c) => escapeCell(rec[c.key] ?? "")).join(",")
  );
  return [header, ...rows].join("\r\n");
}
