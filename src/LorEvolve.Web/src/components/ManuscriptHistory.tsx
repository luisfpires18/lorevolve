import { useEffect, useId, useRef, useState } from 'react'
import { plainMentions } from '../lore/mentions'
import { VersionActor } from './VersionActor'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { formatDateTime } from '../lib/dates'
import {
  getManuscriptRevision,
  listManuscriptRevisions,
  MANUSCRIPT_CHANGED,
  restoreManuscriptRevision,
} from '../stories/api'
import {
  ManuscriptRevisionKind,
  type ManuscriptRevisionDetail,
  type ManuscriptRevisionSummary,
  type SceneManuscript,
} from '../stories/types'
import { confirmAction } from '../lib/confirm'

interface ManuscriptHistoryProps {
  /** The panel's id, which the toggle that opens it controls. */
  id: string
  universeId: string
  storyId: string
  sceneId: string

  /** Bumped whenever the prose is saved or put back, so the open history reads itself again. */
  reloadKey: number

  /** The manuscript as it is saved - what a restore names as the version it is written over. */
  current: { content: string; updatedAt: string | null; version: number }

  /** Why no version can be put back right now, if none can: unsaved writing, or a recovered draft still to decide. */
  blocked: string | null

  onRestored: (manuscript: SceneManuscript) => void

  /** A restore found the prose had been saved elsewhere since: read it again. */
  onStale: () => void
}

/** What a version was, in a few words. */
function describeVersion(
  revision: ManuscriptRevisionSummary,
  revisions: ManuscriptRevisionSummary[],
) {
  if (revision.kind === ManuscriptRevisionKind.Restored) {
    const from = revisions.find((candidate) => candidate.id === revision.restoredFromRevisionId)
    return from
      ? t('manuscript.history.restoredFrom', { number: from.number })
      : t('manuscript.history.restoredEarlier')
  }
  if (revision.isEmpty) return t('manuscript.history.emptied')
  return revision.kind === ManuscriptRevisionKind.Created
    ? t('manuscript.history.first')
    : t('manuscript.history.saved')
}

/**
 * A scene's saved versions: every save that changed the prose, newest first.
 *
 * Opened on request, so writing a scene costs no history read, and read without any text - a version's prose is fetched
 * only when it is viewed. Any version can be read in place, and any but the newest put back, which saves it again as the
 * newest and loses nothing on record. Putting one back waits while the editor holds unsaved writing, because it would
 * replace text that exists nowhere else.
 */
export function ManuscriptHistory({
  id,
  universeId,
  storyId,
  sceneId,
  reloadKey,
  current,
  blocked,
  onRestored,
  onStale,
}: ManuscriptHistoryProps) {
  const { t } = useI18n()
  const titleId = useId()
  const blockedId = useId()
  const [revisions, setRevisions] = useState<ManuscriptRevisionSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [viewing, setViewing] = useState<{
    id: string
    detail: ManuscriptRevisionDetail | null
  } | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'status' | 'alert'; text: string } | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    listManuscriptRevisions(universeId, storyId, sceneId, controller.signal)
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
  }, [universeId, storyId, sceneId, reloadKey])

  async function view(revisionId: string) {
    if (viewing?.id === revisionId) {
      setViewing(null)
      return
    }

    setViewing({ id: revisionId, detail: null })
    setMessage(null)

    try {
      const detail = await getManuscriptRevision(universeId, storyId, sceneId, revisionId)
      setViewing((open) => (open?.id === revisionId ? { id: revisionId, detail } : open))
    } catch {
      setViewing(null)
      setMessage({ tone: 'alert', text: t('manuscript.history.openFailed') })
    }
  }

  async function restore(revision: ManuscriptRevisionSummary) {
    if (inFlight.current || blocked !== null) return
    if (
      !(await confirmAction({
        title: t('manuscript.history.restore.title', { number: revision.number }),
        message: t('manuscript.history.restore.message'),
        confirmLabel: t('manuscript.history.restore.confirm'),
      }))
    ) {
      return
    }

    inFlight.current = true
    setBusyId(revision.id)
    setMessage(null)

    try {
      const restored = await restoreManuscriptRevision(
        universeId,
        storyId,
        sceneId,
        revision.id,
        current.version,
      )
      setViewing(null)
      onRestored(restored)
      setMessage({
        tone: 'status',
        text: t('manuscript.history.restore.done', { number: revision.number }),
      })
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409 && error.code === MANUSCRIPT_CHANGED) {
        setMessage({
          tone: 'alert',
          text: t('manuscript.history.restore.stale'),
        })
        onStale()
      } else if (error instanceof ApiError && error.status === 404) {
        setMessage({
          tone: 'alert',
          text: t('manuscript.history.restore.gone'),
        })
      } else {
        setMessage({ tone: 'alert', text: t('manuscript.history.restore.failed') })
      }
    } finally {
      inFlight.current = false
      setBusyId(null)
    }
  }

  return (
    <section
      className="mshistory"
      id={id}
      aria-labelledby={titleId}
      data-testid="manuscript-history"
    >
      <p className="mshistory__title" id={titleId}>
        {t('manuscript.history.title')}
      </p>
      <p className="mshistory__lede">{t('manuscript.history.lede')}</p>

      {blocked ? (
        <p className="mshistory__blocked" id={blockedId} data-testid="manuscript-history-blocked">
          {blocked}
        </p>
      ) : null}

      {message ? (
        <p
          className={message.tone === 'alert' ? 'form__message' : 'mshistory__done'}
          role={message.tone}
          data-testid="manuscript-history-message"
        >
          {message.text}
        </p>
      ) : null}

      {failed ? (
        <p className="history__quiet" role="status">
          {t('manuscript.history.readFailed')}
        </p>
      ) : revisions === null ? (
        <p className="history__quiet" role="status">
          {t('manuscript.history.opening')}
        </p>
      ) : revisions.length === 0 ? (
        <p className="history__quiet">{t('manuscript.history.none')}</p>
      ) : (
        <ol className="history__list" data-testid="manuscript-history-list">
          {revisions.map((revision, index) => {
            const isViewing = viewing?.id === revision.id
            const snapshotId = `${id}-version-${revision.number}`
            return (
              <li className="version" key={revision.id} data-version={revision.number}>
                <p className="version__when">
                  <time dateTime={revision.createdAt}>{formatDateTime(revision.createdAt)}</time>
                </p>

                <div className="version__body">
                  <p className="version__what" data-testid="manuscript-version-what">
                    {describeVersion(revision, revisions)}
                    {index === 0 ? (
                      <span className="version__now">{t('manuscript.history.savedNow')}</span>
                    ) : null}
                  </p>
                  <p className="version__meta">
                    <span>{t('manuscript.history.version', { number: revision.number })}</span>
                    <VersionActor name={revision.actorName} />
                  </p>
                </div>

                <div className="version__tools">
                  <button
                    className="button button--text button--sm"
                    type="button"
                    aria-expanded={isViewing}
                    aria-controls={snapshotId}
                    aria-label={t(
                      isViewing
                        ? 'manuscript.history.hideVersion'
                        : 'manuscript.history.viewVersion',
                      { number: revision.number },
                    )}
                    onClick={() => void view(revision.id)}
                    data-testid="manuscript-version-view"
                  >
                    {isViewing ? t('manuscript.history.hide') : t('manuscript.history.view')}
                  </button>
                  {index > 0 ? (
                    <button
                      className="button button--text button--sm"
                      type="button"
                      disabled={blocked !== null}
                      aria-describedby={blocked ? blockedId : undefined}
                      aria-label={t('manuscript.history.restoreVersion', {
                        number: revision.number,
                      })}
                      onClick={() => void restore(revision)}
                      data-testid="manuscript-version-restore"
                    >
                      {busyId === revision.id
                        ? t('manuscript.history.restoring')
                        : t('manuscript.history.restoreButton')}
                    </button>
                  ) : null}
                </div>

                {isViewing ? (
                  <div
                    className="version__snapshot"
                    id={snapshotId}
                    data-testid="manuscript-version-snapshot"
                  >
                    {viewing.detail === null ? (
                      <p className="history__quiet" role="status">
                        {t('manuscript.history.opening')}
                      </p>
                    ) : viewing.detail.content === '' ? (
                      <p className="entry__blank">{t('manuscript.history.noText')}</p>
                    ) : (
                      <div
                        className="mshistory__text prose"
                        role="region"
                        aria-label={t('manuscript.history.textOf', { number: revision.number })}
                        tabIndex={0}
                      >
                        {plainMentions(viewing.detail.content)}
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
