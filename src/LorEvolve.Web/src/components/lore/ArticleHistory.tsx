import { useEffect, useId, useState } from 'react'
import { History } from 'lucide-react'
import { LoreArticle } from '../ArticleView'
import { VersionActor } from '../VersionActor'
import { ApiError } from '../../lib/api'
import { isChangedElsewhere } from '../../lib/editConflict'
import {
  ARTICLE_CHANGED,
  getArticleRevision,
  listArticleRevisions,
  restoreArticleRevision,
  type ArticleRevisionDetail,
  type ArticleRevisionSummary,
  type EntityArticle,
} from '../../lore/article'
import { isEmptyDocument } from '../../lore/document'
import { RevisionKind } from '../../lore/revisions'
import { confirmAction } from '../../lib/confirm'
import { t, useI18n } from '../../i18n'
import type { Stored } from '../../lore/useEntityArticle'
import { Button } from '../Button'
import { DisclosureButton } from '../DisclosureButton'
import { QuietNote } from '../QuietNote'
import { DateText } from '../DateText'

interface ArticleHistoryProps {
  universeId: string
  entityId: string

  /** Bumped by the article whenever it is saved or put back, so an open history reads itself again. */
  reloadKey: number

  /** The article as it stands - what a restore names as the version it is written over. */
  current: Stored

  onRestored: (article: EntityArticle) => void

  /** A restore found the article had moved on since it was read: read it again. Nothing unsaved exists while reading. */
  onStale: () => void
}

/** What a version was, in a few words. */
function describeVersion(revision: ArticleRevisionSummary, revisions: ArticleRevisionSummary[]) {
  if (revision.kind === RevisionKind.Restored) {
    const from = revisions.find((candidate) => candidate.id === revision.restoredFromRevisionId)
    return from
      ? t('entity.articleHistory.restored', { number: from.number })
      : t('entity.articleHistory.restoredEarlier')
  }
  if (revision.isEmpty) return t('entity.articleHistory.cleared')
  return revision.kind === RevisionKind.Created
    ? t('entity.articleHistory.first')
    : t('entity.articleHistory.saved')
}

/**
 * The article's own history, closed until it is asked for - reading an entry costs no history read. Newest first; any
 * version can be read in place, and any but the newest put back, which is recorded as a version of its own.
 */
export function ArticleHistory({
  universeId,
  entityId,
  reloadKey,
  current,
  onRestored,
  onStale,
}: ArticleHistoryProps) {
  const { t } = useI18n()
  const bodyId = useId()
  const snapshotId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [revisions, setRevisions] = useState<ArticleRevisionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewing, setViewing] = useState<{
    id: string
    detail: ArticleRevisionDetail | null
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    const controller = new AbortController()
    listArticleRevisions(universeId, entityId, controller.signal)
      .then((loaded) => {
        setRevisions(loaded)
        setFailed(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })

    return () => {
      controller.abort()
    }
  }, [isOpen, universeId, entityId, reloadKey])

  async function view(revisionId: string) {
    if (viewing?.id === revisionId) {
      setViewing(null)
      return
    }

    setViewing({ id: revisionId, detail: null })
    setMessage(null)

    try {
      const detail = await getArticleRevision(universeId, entityId, revisionId)
      setViewing((open) => (open?.id === revisionId ? { id: revisionId, detail } : open))
    } catch {
      setViewing(null)
      setMessage(t('entity.articleHistory.openFailed'))
    }
  }

  async function restore(revision: ArticleRevisionSummary) {
    if (
      !(await confirmAction({
        title: t('entity.articleHistory.confirm.title', { number: revision.number }),
        message: t('entity.articleHistory.confirm.message'),
        confirmLabel: t('entity.articleHistory.confirm.confirm'),
      }))
    ) {
      return
    }

    setBusyId(revision.id)
    setMessage(null)

    try {
      const restored = await restoreArticleRevision(
        universeId,
        entityId,
        revision.id,
        current.version,
      )
      setViewing(null)
      onRestored(restored)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, ARTICLE_CHANGED)) {
        setMessage(t('entity.articleHistory.stale'))
        onStale()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage(t('entity.articleHistory.entryGone'))
      } else {
        setMessage(t('entity.articleHistory.restoreFailed'))
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="article__history">
      <DisclosureButton
        tone="secondary"
        icon={History}
        className="article__historytoggle"
        expanded={isOpen}
        controls={bodyId}
        onToggle={() => setIsOpen((open) => !open)}
        data-testid="article-history-toggle"
      >
        {t('entity.articleHistory.toggle')}
      </DisclosureButton>

      {isOpen ? (
        <div id={bodyId}>
          {message ? (
            <p className="form__message" role="alert" data-testid="article-history-error">
              {message}
            </p>
          ) : null}

          {failed ? (
            <QuietNote className="history__quiet" size="ui" role="status">
              {t('entity.articleHistory.readFailed')}
            </QuietNote>
          ) : revisions === null ? (
            <QuietNote className="history__quiet" size="ui" role="status">
              {t('entity.articleHistory.opening')}
            </QuietNote>
          ) : revisions.length === 0 ? (
            <QuietNote className="history__quiet" size="ui">
              {t('entity.articleHistory.none')}
            </QuietNote>
          ) : (
            <ol className="history__list" data-testid="article-history-list">
              {revisions.map((revision, index) => (
                <li className="version" key={revision.id} data-version={revision.number}>
                  <p className="version__when">
                    <DateText value={revision.createdAt} withTime />
                  </p>

                  <div className="version__body">
                    <p className="version__what" data-testid="article-version-what">
                      {describeVersion(revision, revisions)}
                      {index === 0 ? (
                        <span className="version__now">
                          {t('entity.articleHistory.nowShowing')}
                        </span>
                      ) : null}
                    </p>
                    <p className="version__meta">
                      <span>{t('entity.articleHistory.version', { number: revision.number })}</span>
                      <VersionActor name={revision.actorName} />
                    </p>
                  </div>

                  <div className="version__tools">
                    <DisclosureButton
                      tone="text"
                      size="sm"
                      expanded={viewing?.id === revision.id}
                      controls={`${snapshotId}-${revision.id}`}
                      onToggle={() => void view(revision.id)}
                      data-testid="article-version-view"
                    />
                    {index > 0 ? (
                      <Button
                        tone="text"
                        size="sm"
                        disabled={busyId !== null}
                        onClick={() => void restore(revision)}
                        data-testid="article-version-restore"
                      >
                        {busyId === revision.id
                          ? t('entity.articleHistory.restoring')
                          : t('entity.articleHistory.restore')}
                      </Button>
                    ) : null}
                  </div>

                  {viewing?.id === revision.id ? (
                    <div
                      className="version__snapshot"
                      id={`${snapshotId}-${revision.id}`}
                      data-testid="article-version-snapshot"
                    >
                      {viewing.detail === null ? (
                        <QuietNote className="history__quiet" size="ui" role="status">
                          {t('entity.articleHistory.snapshotOpening')}
                        </QuietNote>
                      ) : isEmptyDocument(viewing.detail.content) ? (
                        <p className="entry__blank">{t('entity.articleHistory.snapshotBlank')}</p>
                      ) : (
                        <LoreArticle content={viewing.detail.content} />
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  )
}
