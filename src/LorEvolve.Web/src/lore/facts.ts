import { formatChronologyYear } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { formatDate } from '../lib/dates'
import { FieldKind } from './types'

/** One field's value as a reader sees it: the entry's page and the manuscript's Lore preview say it the same way. */
export function renderFact(
  value: {
    kind: number
    text: string | null
    number: number | null
    eraId: string | null
    boolean: boolean | null
    date: string | null
    optionValues: string[]
    referencedEntityName: string | null
    referencedEntityIsTrashed: boolean
  },
  chronology: Chronology,
) {
  switch (value.kind) {
    case FieldKind.ShortText:
    case FieldKind.LongText:
      return value.text ?? '—'
    case FieldKind.Number:
      if (value.number === null) return '—'
      // A year in an era reads the way the universe writes it; any other number stays as typed.
      return value.eraId
        ? formatChronologyYear(chronology, value.number, value.eraId)
        : value.number
    case FieldKind.Boolean:
      return value.boolean ? 'Yes' : 'No'
    case FieldKind.Date:
      return value.date ? formatDate(value.date) : '—'
    case FieldKind.Select:
    case FieldKind.MultiSelect:
      return value.optionValues.length > 0 ? value.optionValues.join(', ') : '—'
    case FieldKind.EntityReference:
      if (value.referencedEntityName === null) return '—'
      // Named, not hidden: the entry is still there and still connected, it is simply in the
      // Trash. Saying so is what stops the author reading it as lore that has gone missing.
      return value.referencedEntityIsTrashed
        ? `${value.referencedEntityName} (in Trash)`
        : value.referencedEntityName
    default:
      return '—'
  }
}
