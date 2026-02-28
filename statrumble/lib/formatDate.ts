type DateInput = string | null | undefined;

type DatePartKey = "year" | "month" | "day" | "hour" | "minute" | "second";

type DateParts = Partial<Record<DatePartKey, string>>;

const ISO_WITH_TIME = /^\d{4}-\d{2}-\d{2}T/;
const HAS_TIMEZONE = /(Z|[+\-]\d{2}:\d{2})$/;
const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE ?? "America/Los_Angeles";
const LOCALE = "en-US";

const DATE_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat(LOCALE, {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (ISO_WITH_TIME.test(trimmed) && !HAS_TIMEZONE.test(trimmed)) {
    return null;
  }

  if (!HAS_TIMEZONE.test(trimmed)) {
    return null;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function extractParts(formatter: Intl.DateTimeFormat, date: Date): DateParts {
  const parts: DateParts = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type === "literal") {
      continue;
    }

    const key = part.type as DatePartKey;
    parts[key] = part.value;
  }

  return parts;
}

function formatDateParts(parts: DateParts): string | null {
  if (!parts.year || !parts.month || !parts.day) {
    return null;
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateTimeUiParts(parts: DateParts): string | null {
  if (
    !parts.year ||
    !parts.month ||
    !parts.day ||
    !parts.hour ||
    !parts.minute ||
    !parts.second
  ) {
    return null;
  }

  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day} ${hour}:${parts.minute}:${parts.second}`;
}

export function formatDateLabel(value: DateInput): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const parsed = parseDate(value);

  if (!parsed) {
    return value;
  }

  const parts = extractParts(DATE_ONLY_FORMATTER, parsed);
  return formatDateParts(parts) ?? DATE_ONLY_FORMATTER.format(parsed);
}

export function formatDateTimeLabel(value: DateInput): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const parsed = parseDate(value);

  if (!parsed) {
    return value;
  }

  const parts = extractParts(DATE_TIME_PARTS_FORMATTER, parsed);
  return formatDateTimeUiParts(parts) ?? DATE_TIME_PARTS_FORMATTER.format(parsed);
}

export function formatDateTimeLabel24(value: DateInput): string {
  return formatDateTimeLabel(value);
}
