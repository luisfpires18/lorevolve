import { Pencil, Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
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
    <ActionMenu
      label={t('time.timeline.moreActions', { title: entry.title })}
      triggerTestId={`moment-actions-${entry.title}`}
    >
      <button
        className="actionmenu__item"
        type="button"
        onClick={() => setForm({ mode: 'edit', entry })}
        data-testid={`menu-edit-moment-${entry.title}`}
      >
        <ActionIcon icon={Pencil} />
        {t('time.timeline.editMoment')}
      </button>
      <hr className="actionmenu__divider" />
      <button
        className="actionmenu__item actionmenu__item--danger"
        type="button"
        onClick={() => void remove(entry)}
        data-testid={`delete-moment-${entry.title}`}
      >
        <ActionIcon icon={Trash2} />
        {t('time.timeline.deleteMoment')}
      </button>
    </ActionMenu>
  )
}
