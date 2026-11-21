import { t } from '../i18n'
import type { HistoryRevision, HistoryWords } from '../components/lore/ArticleHistory'
import {
  ARTICLE_CHANGED,
  getArticleRevision,
  listArticleRevisions,
  restoreArticleRevision,
} from './article'

/** The article's versions as its history reads and puts them back. Memoise it on the two ids. */
export function articleRevisions(universeId: string, entityId: string) {
  return {
    list: (signal: AbortSignal) => listArticleRevisions(universeId, entityId, signal),
    get: (revisionId: string) => getArticleRevision(universeId, entityId, revisionId),
    restore: (revisionId: string, version: number) =>
      restoreArticleRevision(universeId, entityId, revisionId, version),
    changedCode: ARTICLE_CHANGED,
  }
}

/** The Lore article's words. */
export function articleHistoryWords<S extends HistoryRevision>(): HistoryWords<S> {
  return {
    restored: (number) => t('entity.articleHistory.restored', { number }),
    restoredEarlier: t('entity.articleHistory.restoredEarlier'),
    cleared: t('entity.articleHistory.cleared'),
    first: t('entity.articleHistory.first'),
    saved: t('entity.articleHistory.saved'),
    openFailed: t('entity.articleHistory.openFailed'),
    confirm: (revision) => ({
      title: t('entity.articleHistory.confirm.title', { number: revision.number }),
      message: t('entity.articleHistory.confirm.message'),
      confirmLabel: t('entity.articleHistory.confirm.confirm'),
    }),
    changedElsewhere: t('entity.articleHistory.stale'),
    gone: t('entity.articleHistory.entryGone'),
    failed: t('entity.articleHistory.restoreFailed'),
    toggle: t('entity.articleHistory.toggle'),
    readFailed: t('entity.articleHistory.readFailed'),
    opening: t('entity.articleHistory.opening'),
    none: t('entity.articleHistory.none'),
    nowShowing: t('entity.articleHistory.nowShowing'),
    version: (number) => t('entity.articleHistory.version', { number }),
    restoring: t('entity.articleHistory.restoring'),
    restore: t('entity.articleHistory.restore'),
    snapshotOpening: t('entity.articleHistory.snapshotOpening'),
    snapshotBlank: t('entity.articleHistory.snapshotBlank'),
  }
}
