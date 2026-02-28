const NUMBER_LOCALE = "en-US";

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);
}
