import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import {
  getManuscriptRevision,
  listManuscriptRevisions,
  MANUSCRIPT_CHANGED,
  restoreManuscriptRevision,
} from '../stories/api'
import type {
  ManuscriptRevisionDetail,
  ManuscriptRevisionSummary,
  SceneManuscript,
} from '../stories/types'
import { confirmAction } from '../lib/confirm'
import { ManuscriptRevision } from './stories/ManuscriptRevision'
import { QuietNote } from './QuietNote'
import { FormMessage } from './FormMessage'

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
        message.tone === 'alert' ? (
          <FormMessage testId="manuscript-history-message">{message.text}</FormMessage>
        ) : (
          <p
            className="mshistory__done"
            role={message.tone}
            data-testid="manuscript-history-message"
          >
            {message.text}
          </p>
        )
      ) : null}

      {failed ? (
        <QuietNote className="history__quiet" size="ui" role="status">
          {t('manuscript.history.readFailed')}
        </QuietNote>
      ) : revisions === null ? (
        <QuietNote className="history__quiet" size="ui" role="status">
          {t('manuscript.history.opening')}
        </QuietNote>
      ) : revisions.length === 0 ? (
        <QuietNote className="history__quiet" size="ui">
          {t('manuscript.history.none')}
        </QuietNote>
      ) : (
        <ol className="history__list" data-testid="manuscript-history-list">
          {revisions.map((revision, index) => (
            <ManuscriptRevision
              key={revision.id}
              revision={revision}
              index={index}
              revisions={revisions}
              id={id}
              blocked={blocked}
              blockedId={blockedId}
              viewing={viewing}
              busyId={busyId}
              view={view}
              restore={restore}
            />
          ))}
        </ol>
      )}
    </section>
  )
}
