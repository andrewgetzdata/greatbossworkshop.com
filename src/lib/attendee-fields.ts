/**
 * The EOS attendee fields we collect in our own pre-checkout form (everything
 * Stripe Checkout can't collect natively). Pure + dependency-free so both the
 * checkout function and vitest can use it. Email/phone/address come from Stripe
 * natively and are NOT part of this form.
 */

/** Stripe metadata values are capped at 500 chars; keep headroom. */
export const ROLE_DESC_MAX = 480;

/** Raw form input as received in the checkout POST body (all optional/untrusted). */
export interface AttendeeFormInput {
  firstName?: unknown;
  lastName?: unknown;
  company?: unknown;
  jobTitle?: unknown;
  roleDesc?: unknown;
  hasImplementer?: unknown; // "yes" | "no"
  implementerName?: unknown; // only when hasImplementer === "yes"
  wantsMoreInfo?: unknown; // only when hasImplementer === "no"; "yes" | "no"
}

/** Cleaned, validated attendee fields ready to store. */
export interface AttendeeFields {
  firstName: string;
  lastName: string;
  company: string;
  jobTitle: string;
  roleDesc: string;
  hasImplementer: "yes" | "no";
  implementerName: string;
  wantsMoreInfo: string;
}

/** Required fields per the locked plan (branch fields stay optional). */
const REQUIRED: Array<keyof AttendeeFields> = [
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "roleDesc",
  "hasImplementer",
];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Validate + normalize raw form input.
 * Returns the cleaned fields, or a list of missing/invalid field names.
 * roleDesc is truncated to ROLE_DESC_MAX so the Stripe metadata write can't
 * exceed the 500-char value cap.
 */
export function parseAttendeeFields(
  input: AttendeeFormInput
): { ok: true; fields: AttendeeFields } | { ok: false; errors: string[] } {
  const hasImplementerRaw = str(input.hasImplementer).toLowerCase();
  const hasImplementer: "yes" | "no" | "" =
    hasImplementerRaw === "yes" ? "yes" : hasImplementerRaw === "no" ? "no" : "";

  const fields: AttendeeFields = {
    firstName: str(input.firstName),
    lastName: str(input.lastName),
    company: str(input.company),
    jobTitle: str(input.jobTitle),
    roleDesc: str(input.roleDesc).slice(0, ROLE_DESC_MAX),
    hasImplementer: hasImplementer || "no",
    // Only keep the branch field that matches the answer.
    implementerName: hasImplementer === "yes" ? str(input.implementerName) : "",
    wantsMoreInfo: hasImplementer === "no" ? str(input.wantsMoreInfo) : "",
  };

  const errors: string[] = [];
  for (const key of REQUIRED) {
    if (key === "hasImplementer") {
      if (!hasImplementer) errors.push("hasImplementer");
    } else if (!fields[key]) {
      errors.push(key);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, fields };
}

/**
 * Map validated fields to the Stripe checkout-session metadata keys
 * (prefixed `attendee_` to namespace them alongside the `workshop_*` keys).
 */
export function toMetadata(fields: AttendeeFields): Record<string, string> {
  return {
    attendee_first_name: fields.firstName,
    attendee_last_name: fields.lastName,
    attendee_company: fields.company,
    attendee_job_title: fields.jobTitle,
    attendee_role_desc: fields.roleDesc,
    attendee_has_implementer: fields.hasImplementer,
    attendee_implementer_name: fields.implementerName,
    attendee_wants_more_info: fields.wantsMoreInfo,
  };
}
