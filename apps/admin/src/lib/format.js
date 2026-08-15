/** Axis label for a timeseries bucket, matched to the grain the API returned. */
export function formatBucket(bucket, grain) {
  const date = new Date(bucket);
  if (grain === 'hour') {
    return date.toLocaleString('en-IN', { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  }
  if (grain === 'week') {
    return `w/c ${date.toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  }
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Downloads a Blob the browser already holds — used for the CSV exports. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** ISO date (YYYY-MM-DD) for <input type="date">. */
export function toDateInput(date) {
  return new Date(date).toISOString().slice(0, 10);
}
