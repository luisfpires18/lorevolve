/** A distance in a sentence: the precision a picture can carry, nothing finer. */
export function approximate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  const magnitude = Math.floor(Math.log10(value))
  const decimals = Math.min(2, Math.max(0, 2 - magnitude))
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals })
}
