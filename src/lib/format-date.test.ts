import { describe, it, expect } from "vitest";
import {
  formatRelativeTime,
  formatAbsoluteTime,
  getDateGroup,
} from "./format-date";

const NOW = Date.now();

describe("formatRelativeTime", () => {
  it("returns relative string for ~1 minute ago", () => {
    const ts = String(NOW - 60 * 1000);
    const result = formatRelativeTime(ts);
    expect(result).toContain("minute");
  });

  it("returns relative string for ~1 hour ago", () => {
    const ts = String(NOW - 60 * 60 * 1000);
    const result = formatRelativeTime(ts);
    expect(result).toContain("hour");
  });

  it("returns relative string for ~1 day ago", () => {
    const ts = String(NOW - 25 * 60 * 60 * 1000);
    const result = formatRelativeTime(ts);
    expect(result).toContain("day");
  });

  it("returns relative string for ~1 week ago", () => {
    const ts = String(NOW - 7 * 24 * 60 * 60 * 1000);
    const result = formatRelativeTime(ts);
    expect(result).toContain("week");
  });
});

describe("formatAbsoluteTime", () => {
  it("returns a valid ISO 8601 string", () => {
    const ts = String(NOW);
    const result = formatAbsoluteTime(ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("round-trips a known timestamp", () => {
    const knownMs = 1706308200000;
    const result = formatAbsoluteTime(String(knownMs));
    expect(new Date(result).getTime()).toBe(knownMs);
  });
});

describe("getDateGroup", () => {
  it("returns 'Today' for current time minus 1 minute", () => {
    const ts = String(NOW - 60 * 1000);
    expect(getDateGroup(ts)).toBe("Today");
  });

  it("returns 'Yesterday' for current time minus 25 hours", () => {
    const ts = String(NOW - 25 * 60 * 60 * 1000);
    expect(getDateGroup(ts)).toBe("Yesterday");
  });

  it("returns 'This week' for current time minus 4 days", () => {
    const ts = String(NOW - 4 * 24 * 60 * 60 * 1000);
    expect(getDateGroup(ts)).toBe("This week");
  });

  it("returns 'Older' for current time minus 10 days", () => {
    const ts = String(NOW - 10 * 24 * 60 * 60 * 1000);
    expect(getDateGroup(ts)).toBe("Older");
  });

  it("returns 'Today' for a timestamp exactly at midnight today", () => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );
    expect(getDateGroup(String(midnight.getTime()))).toBe("Today");
  });
});
