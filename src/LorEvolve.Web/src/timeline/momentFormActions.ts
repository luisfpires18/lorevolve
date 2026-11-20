import { createTimelineEntry, updateTimelineEntry } from './api'
import { DateKind, type DateKindValue, type TimelineEntry } from './types'
import { inputOf, type ComponentKey, type EraKey, type MomentDraft } from './momentDraft'
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
  form,
  setBlocked,
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
    const input = inputOf(draft, reckonsInEras, custom)

    await form.save(async () => {
      setBlocked(null)
      if (entry) {
        await updateTimelineEntry(universeId, entry.id, input)
      } else {
        await createTimelineEntry(universeId, input)
      }
      onSaved()
    })
  }

  return { edit, setComponent, chooseKind, save }
}
