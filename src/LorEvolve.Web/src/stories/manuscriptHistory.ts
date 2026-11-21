import { useMemo } from 'react'
import { t } from '../i18n'
import type { HistoryWords } from '../components/lore/ArticleHistory'
import {
  getManuscriptRevision,
  listManuscriptRevisions,
  MANUSCRIPT_CHANGED,
  restoreManuscriptRevision,
} from './api'
import type { ManuscriptRevisionSummary } from './types'

/** A scene manuscript's versions as its history reads and puts them back. Memoise it on the three ids. */
export function manuscriptRevisions(universeId: string, storyId: string, sceneId: string) {
  return {
    list: (signal: AbortSignal) => listManuscriptRevisions(universeId, storyId, sceneId, signal),
    get: (revisionId: string) => getManuscriptRevision(universeId, storyId, sceneId, revisionId),
    restore: (revisionId: string, version: number) =>
      restoreManuscriptRevision(universeId, storyId, sceneId, revisionId, version),
    changedCode: MANUSCRIPT_CHANGED,
  }
}

/** The store, memoised on the three ids so the open history reads itself again only when it should. */
export function useManuscriptRevisions(universeId: string, storyId: string, sceneId: string) {
  return useMemo(
    () => manuscriptRevisions(universeId, storyId, sceneId),
    [universeId, storyId, sceneId],
  )
}

/**
 * The history as a panel under the scene's tools, which hold its toggle. Putting a version back waits while the editor
 * holds unsaved writing or a recovered draft to decide, because it would replace text that exists nowhere else.
 */
export function manuscriptPanel(
  id: string,
  { isReady, recovered, isDirty }: { isReady: boolean; recovered: boolean; isDirty: boolean },
) {
  return {
    id,
    title: t('manuscript.history.title'),
    lede: t('manuscript.history.lede'),
    blocked: !isReady
      ? t('manuscript.editor.blocked.opening')
      : recovered
        ? t('manuscript.editor.blocked.recovered')
        : isDirty
          ? t('manuscript.editor.blocked.unsaved')
          : null,
  }
}

/** The manuscript history's own words, for Lore's `ArticleHistory`. */
export function manuscriptHistoryWords(): HistoryWords<ManuscriptRevisionSummary> {
  return {
    restored: (number) => t('manuscript.history.restoredFrom', { number }),
    restoredEarlier: t('manuscript.history.restoredEarlier'),
    cleared: t('manuscript.history.emptied'),
    first: t('manuscript.history.first'),
    saved: t('manuscript.history.saved'),
    openFailed: t('manuscript.history.openFailed'),
    confirm: (revision) => ({
      title: t('manuscript.history.restore.title', { number: revision.number }),
      message: t('manuscript.history.restore.message'),
      confirmLabel: t('manuscript.history.restore.confirm'),
    }),
    changedElsewhere: t('manuscript.history.restore.stale'),
    gone: t('manuscript.history.restore.gone'),
    failed: t('manuscript.history.restore.failed'),
    done: (revision) => t('manuscript.history.restore.done', { number: revision.number }),
    readFailed: t('manuscript.history.readFailed'),
    opening: t('manuscript.history.opening'),
    none: t('manuscript.history.none'),
    nowShowing: t('manuscript.history.savedNow'),
    version: (number) => t('manuscript.history.version', { number }),
    restoring: t('manuscript.history.restoring'),
    restore: t('manuscript.history.restoreButton'),
    snapshotOpening: t('manuscript.history.opening'),
    snapshotBlank: t('manuscript.history.noText'),
    viewName: (number, isOpen) =>
      t(isOpen ? 'manuscript.history.hideVersion' : 'manuscript.history.viewVersion', { number }),
    restoreName: (number) => t('manuscript.history.restoreVersion', { number }),
  }
}
