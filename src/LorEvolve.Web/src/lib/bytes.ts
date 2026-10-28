const UNITS = ['KB', 'MB', 'GB', 'TB'] as const

/**
 * A storage size for people: `243 MB`, `1.5 GB`, `1 GB`. Never a raw byte count.
 *
 * Binary steps (1 KB = 1024 bytes) under the familiar names, which is how every size LorEvolve already shows is counted -
 * the 8 MB picture limit is 8 × 1024 × 1024 - and why a 1 GiB allowance reads as `1 GB` rather than `1.07 GB`. One
 * decimal below ten, whole numbers above, trailing `.0` dropped: storage needs no more precision than that.
 *
 * Anything above zero is at least `1 KB`, so a small picture never reads as nothing used.
 */
export function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 MB'

  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }

  // Rounded to what will be shown before choosing the unit's name, so 1023.9 KB reads `1 MB`, not `1024 KB`.
  const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  if (shown >= 1024 && unit < UNITS.length - 1) {
    return `1 ${UNITS[unit + 1]}`
  }

  return `${Math.max(shown, 1).toLocaleString('en', { maximumFractionDigits: 1 })} ${UNITS[unit]}`
}
