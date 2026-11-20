import { t } from '../i18n'
import { ApiError } from '../lib/api'
import {
  createRelationshipType,
  deleteRelationshipType,
  listRelationshipTypes,
  updateRelationshipType,
} from './api'
import { AgeOrder, FamilySemantic, isParentSemantic, type RelationshipType } from './types'
import { BLANK, MAX_KEY, MIN_KEY, readGap, type TypeDraft } from './typeDraft'
import { years } from './typeSummaries'
import type { useTypeManagerState } from './useTypeManagerState'

export function typeManagerActions({
  universeId,
  editingId,
  draft,
  setTypes,
  setIsAdding,
  setEditingId,
  setDraft,
  setFieldErrors,
  setMessage,
  form,
}: ReturnType<typeof useTypeManagerState> & { universeId: string }) {
  function close() {
    setIsAdding(false)
    setEditingId(null)
    setDraft(BLANK)
    setFieldErrors({})
  }

  async function refresh() {
    setTypes(await listRelationshipTypes(universeId))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})

    // The same checks the API makes, so a mistake is named beside its field before a request.
    // A minimum above the maximum is never swapped: which number was mistyped is the author's call.
    const min = readGap(draft.minGap)
    const max = readGap(draft.maxGap)
    const errors: Record<string, string> = {}
    if (min === 'invalid') errors[MIN_KEY] = t('relationships.types.gapInvalid')
    if (max === 'invalid') errors[MAX_KEY] = t('relationships.types.gapInvalid')
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      errors[MAX_KEY] = t('relationships.types.gapOrder', { years: years(min) })
    }
    if (Object.keys(errors).length > 0 || min === 'invalid' || max === 'invalid') {
      setFieldErrors(errors)
      return
    }

    const input = {
      name: draft.name.trim(),
      // A symmetric kind reads the same both ways, so no second wording is sent.
      inverseName: draft.isSymmetric ? null : draft.inverseName.trim() || null,
      isSymmetric: draft.isSymmetric,
      description: draft.description.trim() ? draft.description.trim() : null,
      displayOrder: null,
      canonConstraints: {
        // Nor does it have an older end, which is why the control is not offered for one.
        ageOrder: draft.isSymmetric ? AgeOrder.None : draft.ageOrder,
        minAgeDifferenceYears: min,
        maxAgeDifferenceYears: max,
      },
      // A symmetric kind has no parent side either, for the same reason; family that defines no ancestry it may carry.
      familySemantic:
        draft.isSymmetric && isParentSemantic(draft.familySemantic)
          ? FamilySemantic.None
          : draft.familySemantic,
    }

    await form.save(async () => {
      if (editingId) {
        await updateRelationshipType(universeId, editingId, input)
      } else {
        await createRelationshipType(universeId, input)
      }
      close()
      await refresh()
    })
  }

  async function remove(type: RelationshipType) {
    setMessage(null)
    try {
      await deleteRelationshipType(universeId, type.id)
      if (editingId === type.id) close()
      await refresh()
    } catch (error: unknown) {
      // 409 carries the count of relations still using the kind, which is the useful part.
      setMessage(error instanceof ApiError ? error.message : t('relationships.types.deleteFailed'))
    }
  }

  /** Merges into the latest draft, so two changes in one tick cannot drop one. */
  function edit(change: Partial<TypeDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  return { close, refresh, save, remove, edit }
}
