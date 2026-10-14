/**
 * EOS attendee CSV column order. Shared with the admin per-class export.
 */

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
