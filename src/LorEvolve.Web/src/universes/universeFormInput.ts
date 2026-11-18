import type { UniverseInput } from './types'

/**
 * A universe's colour is the author's own (UI refinement 014): any `#rrggbb` - the one shape the API accepts - or none.
 * No palette is offered. Colours chosen from the old palette are ordinary values and stay exactly as they were.
 */
export const HEX = /^#[0-9a-fA-F]{6}$/

/** What the picker shows while there is no colour: a neutral it never saves on its own. */
export const PICKER_IDLE = '#7a7468'

/** The text as typed, made into the stored shape where it plainly is one: trimmed, `#` added, lower case. */
export function normalizeHex(text: string) {
  const value = text.trim()
  if (value === '') return ''
  const withHash = value.startsWith('#') ? value : `#${value}`
  return HEX.test(withHash) ? withHash.toLowerCase() : value
}

/** The universe as a save sends it. */
export function inputOf(
  name: string,
  description: string,
  accentColor: string,
  aiHelp: boolean | undefined,
  starterTypes?: boolean,
): UniverseInput {
  return {
    name: name.trim(),
    description: description.trim() || null,
    accentColor: accentColor || null,
    aiHelp,
    ...(starterTypes === undefined ? {} : { starterTypes }),
  }
}
