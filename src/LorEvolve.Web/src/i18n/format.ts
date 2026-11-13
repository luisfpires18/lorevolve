import { currentLocale } from './index'

const dates = new Map<string, Intl.DateTimeFormat>()
const numbers = new Map<string, Intl.NumberFormat>()

/**
 * The `Intl` locale for a formatter (ADR 0071). English keeps what each call site used before translations existed -
 * the browser's own locale (`undefined`) or `'en'` - so nothing changes for English readers; any other language formats
 * dates and numbers its own way.
 * shortcut: an English reader with a non-English browser still gets the browser's date style, as before; pick one
 * English locale here if that ever reads wrong.
 */
function formatLocale(english: string | undefined) {
  const current = currentLocale()
  return current === 'en' ? english : current
}

/** A cached `Intl.DateTimeFormat` in the current language. Read it when formatting, never once at module load. */
export function dateFormat(options: Intl.DateTimeFormatOptions, english?: string) {
  const locale = formatLocale(english)
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = dates.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options)
    dates.set(key, formatter)
  }
  return formatter
}

/** A cached `Intl.NumberFormat` in the current language. Read it when formatting, never once at module load. */
export function numberFormat(options: Intl.NumberFormatOptions = {}, english?: string) {
  const locale = formatLocale(english)
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = numbers.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    numbers.set(key, formatter)
  }
  return formatter
}
