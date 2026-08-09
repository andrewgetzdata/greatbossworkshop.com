/**
 * Pure dedup helper for the daily archived-event export: given the set of
 * currently-archived event IDs and the set already exported ("seen"), return
 * the ones that are new. Kept dependency-free for unit testing.
 */

/** Event IDs present in `archivedIds` but not in `seenIds`, order preserved. */
export function diffNewEvents(
  archivedIds: readonly string[],
  seenIds: readonly string[]
): string[] {
  const seen = new Set(seenIds);
  return archivedIds.filter((id) => !seen.has(id));
}
