import { payloadKey } from '../lib/drawerGuard'
import { periodDrafts, type PeriodDraft } from './periods'
import { Perspective, type RelationshipType, type RelationshipView } from './types'
import type { CanonStatusValue } from '../lore/types'

export interface RelationDraft {
  typeId: string
  /** True when the entry being edited is on the receiving side of the wording. */
  useInverse: boolean
  related: { id: string; name: string } | null
  canonStatus: CanonStatusValue
  /** The older real-world dates (Issue #18): sent back exactly as read, or cleared - never typed any more. */
  legacyStart: string | null
  legacyEnd: string | null
  notes: string
  periods: PeriodDraft[]
}

/** A draft as it would be saved, for telling whether anything changed since the form opened. */
export function draftKey(draft: RelationDraft) {
  return payloadKey({
    ...draft,
    related: draft.related?.id ?? null,
    notes: draft.notes.trim(),
    periods: draft.periods.map(({ key: _key, ...period }) => period),
  })
}

export function choiceKey(typeId: string, useInverse: boolean) {
  return `${typeId}:${useInverse ? 'inverse' : 'forward'}`
}

/** How a link reads from the side of the entry being edited. */
export function labelFor(types: RelationshipType[], typeId: string, useInverse: boolean) {
  const type = types.find((candidate) => candidate.id === typeId)
  if (!type) return ''
  return useInverse && !type.isSymmetric ? (type.inverseName ?? type.name) : type.name
}

/**
 * The links in the order they came, gathered under how each reads from this entry - "Child of",
 * "Member of" - so a reading is said once above its entries rather than beside every one. Grouped by
 * the words shown, never by what a kind is called.
 */
export function byReading(views: RelationshipView[]) {
  const groups = new Map<string, RelationshipView[]>()
  for (const view of views) {
    const group = groups.get(view.label)
    if (group) group.push(view)
    else groups.set(view.label, [view])
  }
  return [...groups.entries()]
}

export function draftFromView(view: RelationshipView): RelationDraft {
  return {
    typeId: view.relationshipTypeId,
    useInverse: view.perspective === Perspective.Inverse,
    related: { id: view.relatedEntityId, name: view.relatedEntityName },
    canonStatus: view.canonStatus,
    legacyStart: view.startDate,
    legacyEnd: view.endDate,
    notes: view.notes ?? '',
    periods: periodDrafts(view.periods ?? []),
  }
}
