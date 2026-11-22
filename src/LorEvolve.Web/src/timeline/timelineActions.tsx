import { t } from '../i18n'
import { deleteTimelineEntry } from './api'
import type { TimelineEntry, TimelineItemPage } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import { confirmAction } from '../lib/confirm'
import type { useI18n } from '../i18n'
import type { useTimelineState } from './useTimelineState'

/** The Timeline screen's handlers: closing the moment drawer, and deleting a moment. */
export function timelineActions({
  universe,
  tx,
  result,
  update,
  reload,
  forgetMoment,
  linkedMoment,
  page,
  setForm,
  setMessage,
}: ReturnType<typeof useTimelineState> & {
  universe: WorkspaceContext['universe']
  tx: ReturnType<typeof useI18n>['tx']
  result: TimelineItemPage | null
  update: (change: Record<string, string | null>) => void
  reload: () => void
  forgetMoment: () => void
}) {
  function closeForm() {
    setForm({ mode: 'closed' })
    if (linkedMoment) forgetMoment()
  }

  async function remove(entry: TimelineEntry) {
    setMessage(null)
    const removed = await confirmAction({
      title: tx('time.timeline.remove.title', { title: <bdi>{entry.title}</bdi> }),
      message: t('time.timeline.remove.message'),
      confirmLabel: t('time.timeline.remove.confirm'),
      busyLabel: t('time.timeline.remove.busy'),
      variant: 'warning',
      failure: t('time.timeline.remove.failure'),
      action: () => deleteTimelineEntry(universe.id, entry.id),
    })
    if (!removed) return

    // Stepping back off a page that just emptied, rather than showing nothing at all.
    if (result && result.items.length === 1 && page > 1) {
      update({ page: String(page - 1) })
    } else {
      reload()
    }
  }

  return { closeForm, remove }
}
