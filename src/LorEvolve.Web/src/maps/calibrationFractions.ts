export function percent(fraction: number) {
  return (Math.round(fraction * 10000) / 100).toString()
}

export function fraction(text: string) {
  const value = Number.parseFloat(text.replace(',', '.'))
  return Number.isFinite(value) ? value / 100 : Number.NaN
}
