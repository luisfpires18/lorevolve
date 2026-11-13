import { formatChronologyYear } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { formatDate } from '../lib/dates'
import { t } from '../i18n'
import { FieldKind } from './types'

/** What a field with nothing in it reads as. A dash, not a word, so it is the same in every language. */
export const EMPTY_FACT = '—'

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
      return value.text ?? EMPTY_FACT
    case FieldKind.Number:
      if (value.number === null) return EMPTY_FACT
      // A year in an era reads the way the universe writes it; any other number stays as typed.
      return value.eraId
        ? formatChronologyYear(chronology, value.number, value.eraId)
        : value.number
    case FieldKind.Boolean:
      return value.boolean ? t('entity.fact.yes') : t('entity.fact.no')
    case FieldKind.Date:
      return value.date ? formatDate(value.date) : EMPTY_FACT
    case FieldKind.Select:
    case FieldKind.MultiSelect:
      return value.optionValues.length > 0 ? value.optionValues.join(', ') : EMPTY_FACT
    case FieldKind.EntityReference:
      if (value.referencedEntityName === null) return EMPTY_FACT
      // Named, not hidden: the entry is still there and still connected, it is simply in the
      // Trash. Saying so is what stops the author reading it as lore that has gone missing.
      return value.referencedEntityIsTrashed
        ? t('entity.fact.inTrash', { name: value.referencedEntityName })
        : value.referencedEntityName
    default:
      return EMPTY_FACT
  }
}
