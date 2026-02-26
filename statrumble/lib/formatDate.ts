type DateInput = string | null | undefined;

const ISO_WITH_TIME = /^\d{4}-\d{2}-\d{2}T/;
const HAS_TIMEZONE = /(Z|[+\-]\d{2}:\d{2})$/;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

type DateTimeParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toKstParts(date: Date): DateTimeParts {
  // Convert to a fixed UTC+9 clock without locale-dependent formatting.
  const shifted = new Date(date.getTime() + KST_OFFSET_MS);

  return {
    year: String(shifted.getUTCFullYear()),
    month: pad2(shifted.getUTCMonth() + 1),
    day: pad2(shifted.getUTCDate()),
    hour: pad2(shifted.getUTCHours()),
    minute: pad2(shifted.getUTCMinutes()),
    second: pad2(shifted.getUTCSeconds()),
  };
}

function formatDateOnly(parts: DateTimeParts): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatDateTime(parts: DateTimeParts, includeSeconds = true): string {
  const base = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  return includeSeconds ? `${base}:${parts.second}` : base;
}

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

export function formatDateLabel(value: DateInput): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const parsed = parseDate(value);

  if (!parsed) {
    return value;
  }

  return formatDateOnly(toKstParts(parsed));
}

export function formatDateTimeLabel(value: DateInput): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const parsed = parseDate(value);

  if (!parsed) {
    return value;
  }

  return formatDateTime(toKstParts(parsed), true);
}

export function formatDateTimeLabel24(value: DateInput): string {
  return formatDateTimeLabel(value);
}
