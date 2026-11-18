import { blockingFindingsOf } from '../canon/blocked'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { createTimelineEntry, updateTimelineEntry } from './api'
import { DateKind, type DateKindValue, type TimelineEntry } from './types'
import {
  DETAIL_ERROR_KEYS,
  inputOf,
  type ComponentKey,
  type EraKey,
  type MomentDraft,
} from './momentDraft'
import type { useMomentFormState } from './useMomentFormState'

/** The moment drawer's handlers: editing the draft, choosing a kind of date, and Save. */
export function momentFormActions({
  universeId,
  entry,
  onSaved,
  reckonsInEras,
  custom,
  draft,
  setDraft,
  setFieldErrors,
  setMessage,
  setBlocked,
  setIsSaving,
  setDetailsOpen,
}: ReturnType<typeof useMomentFormState> & {
  universeId: string
  entry: TimelineEntry | null
  onSaved: () => void
  reckonsInEras: boolean
  custom: boolean
}) {
  function edit(change: Partial<MomentDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  function setComponent(key: ComponentKey | EraKey, value: string) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  /** A kind only carries its own components, so the others are dropped as it changes. */
  function chooseKind(dateKind: DateKindValue) {
    if (dateKind === DateKind.Unknown) {
      edit({
        dateKind,
        startYear: '',
        startMonth: '',
        startDay: '',
        endYear: '',
        endMonth: '',
        endDay: '',
        startEraId: '',
        endEraId: '',
      })
    } else if (dateKind === DateKind.Range) {
      edit({ dateKind })
    } else {
      edit({ dateKind, endYear: '', endMonth: '', endDay: '', endEraId: '' })
    }
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setBlocked(null)
    setIsSaving(true)

    const input = inputOf(draft, reckonsInEras, custom)

    try {
      if (entry) {
        await updateTimelineEntry(universeId, entry.id, input)
      } else {
        await createTimelineEntry(universeId, input)
      }
      onSaved()
    } catch (error: unknown) {
      // The gate's refusal is its own thing: the draft below is intact and the only
      // useful thing to say is what disagreed with it.
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.values(DETAIL_ERROR_KEYS).some((key) => error.fieldErrors[key])) {
          setDetailsOpen(true)
        }
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('time.momentForm.needChange'),
        )
      } else {
        setMessage(t('time.momentForm.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { edit, setComponent, chooseKind, save }
}
