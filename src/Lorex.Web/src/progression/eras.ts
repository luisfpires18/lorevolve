import { formatChronologyPoint } from '../chronology/format'
import type { Chronology, ChronologyValue } from '../chronology/types'
import type { FieldDefinition, FieldValue } from '../lore/types'
import type { Era, EraField } from './types'

/** Where a field's value in an era comes from: the era's own override, its "none in this era", or the entry itself. */
export type FieldSource = 'era' | 'cleared' | 'entry'

export interface ResolvedField {
  definition: FieldDefinition
  source: FieldSource
  /** What reads in that era: the override, or the entry's own value - null when there is none. */
  value: FieldValue | EraField | null
}

/**
 * Every active field of the entry's type as it reads in one era (Issue #41): the era's override when it sets one, nothing when
 * it leaves the field empty, and otherwise the entry's own value. Never another era's: nothing is carried from one era into
 * the next, and nothing is worked out from their order.
 */
export function resolveFields(
  definitions: FieldDefinition[],
  entry: FieldValue[],
  era: Era,
): ResolvedField[] {
  const own = new Map(entry.map((value) => [value.fieldDefinitionId, value]))
  const overrides = new Map(era.fields.map((field) => [field.fieldDefinitionId, field]))

  return definitions.map((definition) => {
    const override = overrides.get(definition.id)
    if (override?.cleared) return { definition, source: 'cleared', value: null }
    if (override) return { definition, source: 'era', value: override }
    return { definition, source: 'entry', value: own.get(definition.id) ?? null }
  })
}

function point(chronology: Chronology, value: ChronologyValue) {
  return formatChronologyPoint(chronology, {
    year: value.year ?? 0,
    month: value.month,
    day: value.day,
    eraId: value.eraId,
    monthId: value.monthId,
  })
}

/** An era's dated span as the universe writes dates, or null when it has none. A bound left out is not known. */
export function formatSpan(
  chronology: Chronology,
  start: ChronologyValue | null,
  end: ChronologyValue | null,
) {
  if (start && end) return `${point(chronology, start)} – ${point(chronology, end)}`
  if (start) return `From ${point(chronology, start)}`
  if (end) return `Until ${point(chronology, end)}`
  return null
}
