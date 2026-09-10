const BAGHDAD_TIME_ZONE = 'Asia/Baghdad';
const GOOGLE_SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_IN_MILLISECONDS = 86_400_000;
const MAX_GOOGLE_SHEETS_SERIAL = 2_958_465;

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const DATE_INPUT_WITH_TIME_PATTERN =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:\d{2})?$/;

export type DateOnlyParts = { year: number; month: number; day: number };

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseDateOnly(value: string): DateOnlyParts {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new Error('التاريخ يجب أن يكون بصيغة YYYY-MM-DD');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error('التاريخ غير صالح');
  }
  return { year, month, day };
}

function validDateOnly(value: string): boolean {
  try { parseDateOnly(value); return true; } catch { return false; }
}

function validDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function dateFromUnknown(value: unknown): Date | null {
  if (Object.prototype.toString.call(value) !== '[object Date]') return null;
  const date = new Date((value as Date).getTime());
  return validDate(date) ? date : null;
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

export function normalizeDateInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const compact = Number.isInteger(value) ? String(value) : '';
    if (/^\d{8}$/.test(compact)) {
      const canonical = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
      return validDateOnly(canonical) ? canonical : '';
    }
    return dateFromGoogleSerial(value);
  }

  if (Object.prototype.toString.call(value) === '[object Date]') {
    const date = value as Date;
    if (!validDate(date)) return '';
    const canonical = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    return validDateOnly(canonical) ? canonical : '';
  }

  const text = String(value).trim();
  if (!text) return '';
  if (DATE_ONLY_PATTERN.test(text)) return validDateOnly(text) ? text : '';
  if (/^\d{8}$/.test(text)) {
    const canonical = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return validDateOnly(canonical) ? canonical : '';
  }

  const display = DISPLAY_DATE_PATTERN.exec(text);
  if (display) {
    const canonical = `${display[3]}-${display[2]}-${display[1]}`;
    return validDateOnly(canonical) ? canonical : '';
  }

  const localDateTime = DATE_INPUT_WITH_TIME_PATTERN.exec(text);
  if (localDateTime && validDateOnly(localDateTime[1])) {
    const hour = Number(localDateTime[2]);
    const minute = Number(localDateTime[3]);
    const second = Number(localDateTime[4] || 0);
    return hour <= 23 && minute <= 59 && second <= 59
      ? localDateTime[1]
      : '';
  }
  return '';
}

export function normalizeSheetDate(value: unknown): string {
  return normalizeDateInput(value);
}

export function formatDateForDisplay(value?: unknown): string {
  const normalized = normalizeDateInput(value);
  if (!normalized) return '—';
  const { year, month, day } = parseDateOnly(normalized);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year).padStart(4, '0')}`;
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
  if (DISPLAY_DATE_PATTERN.test(text)) return normalizeDateInput(text);
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

  const absoluteDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(text);
  if (!absoluteDateTime) return '';
  const date = new Date(text);
  return date ? date.toISOString() : '';
}

export function formatBaghdadDateTime(value: unknown): string {
  const normalized = normalizeSheetDateTime(value);
  if (!normalized) return '—';

  if (DATE_ONLY_PATTERN.test(normalized)) {
    return formatDateForDisplay(normalized);
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
