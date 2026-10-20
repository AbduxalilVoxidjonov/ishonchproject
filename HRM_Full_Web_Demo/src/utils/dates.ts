const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD (not UTC, unlike toISOString). */
export const localDateISO = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local time as HH:MM:SS, independent of browser locale. */
export const localTime = (d: Date = new Date()): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** Local "YYYY-MM-DD HH:MM:SS" timestamp used by audit and attendance logs. */
export const localTimestamp = (d: Date = new Date()): string => `${localDateISO(d)} ${localTime(d)}`;

/** Calendar days between two YYYY-MM-DD dates, both ends included. Returns 0 if end is before start. */
export const inclusiveDays = (startISO: string, endISO: string): number => {
  const start = Date.parse(`${startISO}T00:00:00Z`);
  const end = Date.parse(`${endISO}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
};

/** YYYY-MM-DD -> DD.MM.YYYY */
export const toDisplayDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
};

/** Unique id with a prefix; safe for several ids created in the same millisecond. */
let idCounter = 0;
export const uid = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
