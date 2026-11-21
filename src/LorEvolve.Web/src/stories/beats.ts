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

/**
 * The scene drawer's edits to its beats: rows are added at the end, moved one place at a time and removed, and the focus
 * then goes to the row's title in the list `listId` names, so all of it works from the keyboard as well as the pointer.
 */
export function beatEdits(
  beats: BeatDraft[],
  onChange: (beats: BeatDraft[]) => void,
  listId: string,
) {
  function focusRow(index: number) {
    requestAnimationFrame(() =>
      document
        .getElementById(listId)
        ?.querySelectorAll<HTMLInputElement>('[data-testid="scene-beat-title"]')
        [index]?.focus(),
    )
  }
  return {
    update(index: number, change: Partial<BeatDraft>) {
      onChange(beats.map((beat, at) => (at === index ? { ...beat, ...change } : beat)))
    },
    move(index: number, by: -1 | 1) {
      const target = index + by
      if (target < 0 || target >= beats.length) return
      const reordered = [...beats]
      const [moved] = reordered.splice(index, 1)
      reordered.splice(target, 0, moved)
      onChange(reordered)
      focusRow(target)
    },
    remove(index: number) {
      onChange(beats.filter((_, at) => at !== index))
      focusRow(Math.max(0, index - 1))
    },
    add() {
      onChange([...beats, { key: beatKey(), title: '', note: '' }])
      focusRow(beats.length)
    },
  }
}
