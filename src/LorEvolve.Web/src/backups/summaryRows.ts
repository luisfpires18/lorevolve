import type { BackupPreviewCounts } from './api'
import type { useI18n } from '../i18n'
import { formatCount } from '../i18n/format'

/** What the backup holds, a line per part of a world, leaving out what it has none of. */
export function summaryRows(
  counts: BackupPreviewCounts,
  { t, tn }: ReturnType<typeof useI18n>,
): [string, string][] {
  const rows: [string, string][] = []
  // The count is its own placeholder, grouped the way the app's language groups it.
  const plural = (key: Parameters<typeof tn>[0], count: number) =>
    tn(key, count, { n: formatCount(count) })

  const lore = [
    plural('admin.restore.counts.entry', counts.entries),
    plural('admin.restore.counts.type', counts.entityTypes),
    counts.relationships > 0
      ? plural('admin.restore.counts.relationship', counts.relationships)
      : null,
    counts.timelineEntries > 0
      ? plural('admin.restore.counts.moment', counts.timelineEntries)
      : null,
    counts.eras > 0 ? plural('admin.restore.counts.datePeriod', counts.eras) : null,
    counts.articles > 0 ? plural('admin.restore.counts.article', counts.articles) : null,
  ]
  rows.push([t('admin.restore.summary.lore'), lore.filter(Boolean).join(', ')])

  if (counts.images > 0) {
    rows.push([
      t('admin.restore.summary.pictures'),
      plural('admin.restore.counts.picture', counts.images),
    ])
  }

  if (counts.stories + counts.scenes > 0) {
    rows.push([
      t('admin.restore.summary.stories'),
      [
        plural('admin.restore.counts.story', counts.stories),
        counts.chapters > 0 ? plural('admin.restore.counts.chapter', counts.chapters) : null,
        plural('admin.restore.counts.scene', counts.scenes),
        counts.plotArcs > 0 ? plural('admin.restore.counts.arc', counts.plotArcs) : null,
        counts.beats > 0 ? plural('admin.restore.counts.beat', counts.beats) : null,
        counts.manuscripts > 0
          ? plural('admin.restore.counts.sceneWithProse', counts.manuscripts)
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    ])
  }

  if (counts.ideas + counts.ideasDeleted > 0) {
    rows.push([
      t('admin.restore.summary.ideas'),
      [
        plural('admin.restore.counts.idea', counts.ideas),
        counts.ideasDeleted > 0
          ? t('admin.restore.summary.recentlyDeleted', {
              n: formatCount(counts.ideasDeleted),
            })
          : null,
      ]
        .filter(Boolean)
        .join(', '),
    ])
  }

  if ((counts.ideaBoards ?? 0) > 0) {
    rows.push([
      t('admin.restore.summary.ideaBoards'),
      plural('admin.restore.counts.board', counts.ideaBoards ?? 0),
    ])
  }

  if (counts.worldRules > 0) {
    rows.push([
      t('admin.restore.summary.worldRules'),
      plural('admin.restore.counts.worldRule', counts.worldRules),
    ])
  }

  if ((counts.maps ?? 0) > 0) {
    rows.push([
      t('admin.restore.summary.maps'),
      [
        plural('admin.restore.counts.map', counts.maps ?? 0),
        plural('admin.restore.counts.pin', counts.mapPins ?? 0),
      ].join(', '),
    ])
  }

  const history = counts.entryVersions + counts.articleVersions + counts.manuscriptVersions
  if (history > 0) {
    rows.push([
      t('admin.restore.summary.versions'),
      plural('admin.restore.counts.savedVersion', history),
    ])
  }

  const trash = counts.entriesInTrash + counts.storyItemsInTrash + counts.worldRulesInTrash
  if (trash > 0) {
    rows.push([t('admin.restore.summary.trash'), plural('admin.restore.counts.item', trash)])
  }

  return rows
}
