import { Trash2 } from 'lucide-react'
import { RowMenu } from '../RowMenu'
import { t, useI18n } from '../../i18n'
import type { TimelineEntry } from '../../timeline/types'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'

/** A moment's actions menu, with Edit and Delete. */
export function MomentMenu({
  entry,
  setForm,
  remove,
}: {
  entry: TimelineEntry
  setForm: Dispatch<SetStateAction<FormState>>
  remove: (entry: TimelineEntry) => Promise<void>
}) {
  useI18n()
  return (
    <RowMenu
      label={t('time.timeline.moreActions', { title: entry.title })}
      triggerTestId={`moment-actions-${entry.title}`}
      onEdit={() => setForm({ mode: 'edit', entry })}
      editLabel={t('time.timeline.editMoment')}
      editTestId={`menu-edit-moment-${entry.title}`}
      divided
      onRemove={() => void remove(entry)}
      removeIcon={Trash2}
      removeLabel={t('time.timeline.deleteMoment')}
      removeTestId={`delete-moment-${entry.title}`}
    />
  )
}
