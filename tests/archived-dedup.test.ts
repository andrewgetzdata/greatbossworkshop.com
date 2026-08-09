import { describe, it, expect } from "vitest";
import { diffNewEvents } from "../src/lib/archived-dedup";

// diffNewEvents is the idempotency core of the daily export: it decides which
// archived events still need emailing. Getting this wrong either double-emails
// (in seen but returned) or silently drops (new but filtered).
describe("diffNewEvents", () => {
  it("returns only events not yet seen", () => {
    expect(diffNewEvents(["a", "b", "c"], ["a"])).toEqual(["b", "c"]);
  });

  it("returns empty when all archived events are already seen", () => {
    expect(diffNewEvents(["a", "b"], ["a", "b"])).toEqual([]);
  });

  it("returns all events on first run (empty seen set)", () => {
    expect(diffNewEvents(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("preserves input order", () => {
    expect(diffNewEvents(["c", "a", "b"], ["a"])).toEqual(["c", "b"]);
  });

  it("returns empty for no archived events", () => {
    expect(diffNewEvents([], ["a"])).toEqual([]);
  });
});
