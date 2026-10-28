const formatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/**
 * Reads an API timestamp as the instant it is. The API stores every timestamp in UTC, but those read back from SQLite
 * serialize without a zone ("2026-09-28T10:00:00"), which `Date` would take as the reader's local time. A value with no
 * zone designator is therefore read as UTC; one that carries `Z` or an offset is read as written. (Task 012: the
 * contract is left as it is - changing every timestamp's serialization is not a polish-phase change.)
 */
export function parseApiDate(iso: string) {
  return new Date(/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso) ? `${iso}Z` : iso)
}

/** Formats an API timestamp, returning an empty string rather than "Invalid Date". */
export function formatDate(iso: string) {
  const parsed = parseApiDate(iso)
  return Number.isNaN(parsed.getTime()) ? '' : formatter.format(parsed)
}

const stampFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Formats an API timestamp down to the minute, for the places where two entries on the
 * same day have to be told apart - a document history, and the Trash.
 */
export function formatDateTime(iso: string) {
  const parsed = parseApiDate(iso)
  return Number.isNaN(parsed.getTime()) ? '' : stampFormatter.format(parsed)
}

/**
 * Reads an API timestamp into the value a `<input type="date">` wants. The leading date
 * part is taken verbatim rather than through `Date`, so a stored UTC day is never shifted
 * into the previous one by the reader's own time zone.
 */
export function toDateInput(iso: string | null) {
  return iso ? iso.slice(0, 10) : ''
}

/** Turns a date input back into the UTC instant the API stores. */
export function fromDateInput(value: string) {
  return value ? `${value}T00:00:00Z` : null
}

/** "1 May 3019 to 1 Mar 3120", or one open end, or nothing at all. */
export function formatSpan(start: string | null, end: string | null) {
  if (start && end) return `${formatDate(start)} to ${formatDate(end)}`
  if (start) return `from ${formatDate(start)}`
  if (end) return `until ${formatDate(end)}`
  return ''
}
