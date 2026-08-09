/**
 * Pure grouping of attendees by employer for the weekly report — company
 * alphabetical, then name alphabetical within each company. Dependency-free
 * for unit testing.
 */

export interface NamedAttendee {
  name: string;
  company: string;
}

export interface AttendeeGroup {
  company: string; // display label ("No company" when blank)
  members: string[]; // attendee names, sorted A→Z
}

const NO_COMPANY = "No company";

/**
 * Group attendees by company (case-insensitive alphabetical), and sort names
 * within each group alphabetically. Blank companies collect under "No company",
 * always sorted last.
 */
export function groupAttendeesByCompany(attendees: NamedAttendee[]): AttendeeGroup[] {
  // Key case-insensitively so "Hogwarts" and "hogwarts" are one employer;
  // keep the first-seen spelling as the display label.
  const byKey = new Map<string, { label: string; members: string[] }>();
  for (const a of attendees) {
    const company = a.company.trim() || NO_COMPANY;
    const key = company.toLowerCase();
    const name = a.name.trim() || "—";
    if (!byKey.has(key)) byKey.set(key, { label: company, members: [] });
    byKey.get(key)!.members.push(name);
  }

  const groups: AttendeeGroup[] = [...byKey.values()].map(({ label, members }) => ({
    company: label,
    members: members.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
  }));

  groups.sort((a, b) => {
    // "No company" always last; otherwise case-insensitive alphabetical.
    if (a.company === NO_COMPANY) return 1;
    if (b.company === NO_COMPANY) return -1;
    return a.company.localeCompare(b.company, undefined, { sensitivity: "base" });
  });

  return groups;
}

/** Flatten groups into "Name — Company" display lines, in grouped order. */
export function groupedAttendeeLines(attendees: NamedAttendee[]): string[] {
  const lines: string[] = [];
  for (const g of groupAttendeesByCompany(attendees)) {
    for (const name of g.members) {
      lines.push(g.company === NO_COMPANY ? name : `${name} — ${g.company}`);
    }
  }
  return lines;
}
