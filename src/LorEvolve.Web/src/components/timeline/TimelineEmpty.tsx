import { useUniverseAccess } from '../../universes/access'
import { EmptyState } from '../EmptyState'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'
import { NewButton } from '../NewButton'

/** The empty state, worded for a story, a filtered view or a universe with no moments yet. */
export function TimelineEmpty({
  storyId,
  isFiltered,
  access,
  setForm,
}: {
  storyId: string | null
  isFiltered: boolean
  access: ReturnType<typeof useUniverseAccess>
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  useI18n()
  const emptyTitle = storyId
    ? t('time.timeline.empty.storyTitle')
    : isFiltered
      ? t('time.timeline.empty.filteredTitle')
      : t('time.timeline.empty.title')
  const emptyHint = storyId
    ? t('time.timeline.empty.storyHint')
    : isFiltered
      ? t('time.timeline.empty.filteredHint')
      : t('time.timeline.empty.hint')

  return (
    <EmptyState
      testId="chron-empty"
      title={emptyTitle}
      hint={emptyHint}
      action={
        isFiltered || !access.editContent ? null : (
          <NewButton onClick={() => setForm({ mode: 'new' })} data-testid="empty-new-moment">
            {t('time.timeline.emptyNewMoment')}
          </NewButton>
        )
      }
    />
  )
}
