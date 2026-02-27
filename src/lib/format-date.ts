export function formatRelativeTime(timestampMs: string): string {
  const ms = parseInt(timestampMs, 10);
  const diffMs = Date.now() - ms;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWk = Math.floor(diffDay / 7);
  const diffMo = Math.floor(diffDay / 30);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (diffSec < 60) return rtf.format(-diffSec, "second");
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  if (diffHr < 24) return rtf.format(-diffHr, "hour");
  if (diffDay < 7) return rtf.format(-diffDay, "day");
  if (diffWk < 5) return rtf.format(-diffWk, "week");
  return rtf.format(-diffMo, "month");
}

export function formatAbsoluteTime(timestampMs: string): string {
  return new Date(parseInt(timestampMs, 10)).toISOString();
}

export function getDateGroup(
  timestampMs: string
): "Today" | "Yesterday" | "This week" | "Older" {
  const snapshotDate = new Date(parseInt(timestampMs, 10));
  const now = new Date();

  const snapDay = new Date(
    snapshotDate.getFullYear(),
    snapshotDate.getMonth(),
    snapshotDate.getDate()
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round(
    (today.getTime() - snapDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This week";
  return "Older";
}
