/** One beat as the scene drawer holds it (ADR 0070): `key` only tells rows apart while they are edited and moved. */
export interface BeatDraft {
  key: string
  title: string
  note: string
}

let next = 0

/** A fresh row's key: never sent, never stored. */
export function beatKey() {
  next += 1
  return `beat-${next}`
}
