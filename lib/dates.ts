const BAGHDAD_TIME_ZONE = 'Asia/Baghdad';
const GOOGLE_SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_GOOGLE_SHEETS_SERIAL = 2_958_465;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

function validDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function dateFromUnknown(value: unknown): Date | null {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    const date = new Date((value as Date).getTime());
    return validDate(date) ? date : null;
  }

  const parsed = new Date(String(value));
  return validDate(parsed) ? parsed : null;
}

function baghdadDateFromInstant(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateFromGoogleSerial(value: number): string {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > MAX_GOOGLE_SHEETS_SERIAL
  ) {
    return '';
  }

  const date = new Date(
    GOOGLE_SHEETS_EPOCH_UTC + Math.floor(value) * DAY_IN_MILLISECONDS,
  );
  return validDate(date) ? date.toISOString().slice(0, 10) : '';
}

export function normalizeSheetDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return dateFromGoogleSerial(value);

  if (Object.prototype.toString.call(value) === '[object Date]') {
    const date = dateFromUnknown(value);
    return date ? baghdadDateFromInstant(date) : '';
  }

  const text = String(value).trim();
  if (!text) return '';
  if (DATE_ONLY_PATTERN.test(text)) return validDateOnly(text) ? text : '';
  const datePrefix = text.slice(0, 10);
  if (DATE_ONLY_PATTERN.test(datePrefix) && !validDateOnly(datePrefix)) return '';

  const localDateTime = LOCAL_DATE_TIME_PATTERN.exec(text);
  if (localDateTime && validDateOnly(localDateTime[1])) {
    const hour = Number(localDateTime[2]);
    const minute = Number(localDateTime[3]);
    const second = Number(localDateTime[4] || 0);
    return hour <= 23 && minute <= 59 && second <= 59
      ? localDateTime[1]
      : '';
  }

  const date = dateFromUnknown(text);
  return date ? baghdadDateFromInstant(date) : '';
}

export function normalizeSheetDateTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return dateFromGoogleSerial(value);

  if (Object.prototype.toString.call(value) === '[object Date]') {
    const date = dateFromUnknown(value);
    return date ? date.toISOString() : '';
  }

  const text = String(value).trim();
  if (!text) return '';
  if (DATE_ONLY_PATTERN.test(text)) return validDateOnly(text) ? text : '';
  const datePrefix = text.slice(0, 10);
  if (DATE_ONLY_PATTERN.test(datePrefix) && !validDateOnly(datePrefix)) return '';

  const localDateTime = LOCAL_DATE_TIME_PATTERN.exec(text);
  if (localDateTime && validDateOnly(localDateTime[1])) {
    const hour = Number(localDateTime[2]);
    const minute = Number(localDateTime[3]);
    const second = Number(localDateTime[4] || 0);
    if (hour > 23 || minute > 59 || second > 59) return '';

    const seconds = localDateTime[4] || '00';
    const milliseconds = localDateTime[5]
      ? `.${localDateTime[5].padEnd(3, '0')}`
      : '';
    return `${localDateTime[1]}T${localDateTime[2]}:${localDateTime[3]}:${seconds}${milliseconds}+03:00`;
  }

  const date = dateFromUnknown(text);
  return date ? date.toISOString() : '';
}

export function formatBaghdadDateTime(value: unknown): string {
  const normalized = normalizeSheetDateTime(value);
  if (!normalized) return '—';

  if (DATE_ONLY_PATTERN.test(normalized)) {
    const [year, month, day] = normalized.split('-');
    return `${day}/${month}/${year}`;
  }

  const date = new Date(normalized);
  if (!validDate(date)) return '—';

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BAGHDAD_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(values.hour);
  const displayHour = hour % 12 || 12;
  const period = hour >= 12 ? 'م' : 'ص';
  return `${values.day}/${values.month}/${values.year} — ${displayHour}:${values.minute} ${period}`;
}
