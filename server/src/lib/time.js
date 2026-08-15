/**
 * Analytics run in the restaurant's local timezone, not the server's. A café in
 * Kolkata asking for "today" means midnight IST, even if the API runs in UTC.
 */
export function zonedDayStart(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return isoToUtc(`${get('year')}-${get('month')}-${get('day')}T00:00:00`, timeZone);
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
function offsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** Interprets a wall-clock ISO string as local time in `timeZone`, returns the UTC instant. */
export function isoToUtc(isoLocal, timeZone) {
  const guess = new Date(`${isoLocal}Z`);
  const off = offsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60000);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/** The hour (0-23) of `date` as read in `timeZone`. */
export function zonedHour(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(date)) % 24;
}

/** YYYY-MM-DD of `date` as read in `timeZone`. */
export function zonedDateKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Resolves an analytics range name into a UTC window plus the matching
 * previous window, so every KPI can show a period-over-period delta.
 */
export function resolveRange(range, timeZone, customFrom, customTo) {
  const now = new Date();
  const todayStart = zonedDayStart(now, timeZone);

  let from, to, label;
  switch (range) {
    case 'today':
      from = todayStart; to = addDays(todayStart, 1); label = 'Today';
      break;
    case 'yesterday':
      from = addDays(todayStart, -1); to = todayStart; label = 'Yesterday';
      break;
    case 'week':
      from = addDays(todayStart, -6); to = addDays(todayStart, 1); label = 'Last 7 days';
      break;
    case 'month':
      from = addDays(todayStart, -29); to = addDays(todayStart, 1); label = 'Last 30 days';
      break;
    case 'quarter':
      from = addDays(todayStart, -89); to = addDays(todayStart, 1); label = 'Last 90 days';
      break;
    case 'custom':
      from = isoToUtc(`${customFrom}T00:00:00`, timeZone);
      to   = addDays(isoToUtc(`${customTo}T00:00:00`, timeZone), 1);
      label = `${customFrom} → ${customTo}`;
      break;
    case 'all':
    default:
      from = new Date(0); to = addDays(todayStart, 1); label = 'All time';
      break;
  }

  const span = to.getTime() - from.getTime();
  const prev = range === 'all'
    ? null
    : { from: new Date(from.getTime() - span), to: from };

  return { from, to, prev, label, timeZone };
}
