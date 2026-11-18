import { useCallback, useEffect, useState } from 'react'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { ApiError } from '../lib/api'
import { isChangedElsewhere } from '../lib/editConflict'
import { ENTRY_CHANGED } from './api'
import {
  getRevision,
  imagesNotRestored,
  isNotRestorable,
  listRevisions,
  mentionsImage,
  restoreRevision,
  type EntityRevisionDetail,
  type EntityRevisionSummary,
} from './revisions'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../i18n'
import type { EntityHistoryProps } from '../components/EntityHistory'

type RevisionsArgs = Pick<
  EntityHistoryProps,
  'universeId' | 'entityId' | 'reloadKey' | 'currentVersion' | 'onRestored'
>

/** The entry's versions: the list read, a version opened in place, and putting one back. */
export function useEntityRevisions({
  universeId,
  entityId,
  reloadKey,
  currentVersion,
  onRestored,
}: RevisionsArgs) {
  const { t } = useI18n()
  const [revisions, setRevisions] = useState<EntityRevisionSummary[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [expanded, setExpanded] = useState<{ id: string; key: number } | null>(null)
  const [opened, setOpened] = useState<EntityRevisionDetail | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [reads, setReads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    listRevisions(universeId, entityId, controller.signal)
      .then((loaded) => {
        setRevisions(loaded)
        setStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error')
      })

    return () => {
      controller.abort()
    }
  }, [universeId, entityId, reloadKey, reads])

  // A version stays open only for the history it was opened against. When a write moves
  // the list underneath it, the expansion is stale rather than closed by an effect, so
  // nothing is left showing a snapshot the list no longer explains.
  const openId = expanded?.key === reloadKey ? expanded.id : null

  const open = useCallback(
    async (revisionId: string) => {
      if (openId === revisionId) {
        setExpanded(null)
        setOpened(null)
        return
      }

      setExpanded({ id: revisionId, key: reloadKey })
      setOpened(null)
      setMessage(null)

      try {
        setOpened(await getRevision(universeId, entityId, revisionId))
      } catch {
        setExpanded(null)
        setMessage(t('entity.history.openFailed'))
      }
    },
    [openId, reloadKey, universeId, entityId, t],
  )

  // Said once, where a version is about to be put back and where the list is read - not on
  // every row, and not at all for an entry that has never had a picture.
  const carriesImages = mentionsImage(revisions)

  async function restore(revision: EntityRevisionSummary) {
    if (
      !(await confirmAction({
        title: t('entity.history.restoreConfirm.title', { number: revision.number }),
        message: t('entity.history.restoreConfirm.message'),
        details: carriesImages ? [imagesNotRestored()] : undefined,
        confirmLabel: t('entity.history.restoreConfirm.confirm'),
      }))
    ) {
      return
    }

    setMessage(null)
    setBlocked(null)
    setBusyId(revision.id)

    try {
      await restoreRevision(universeId, entityId, revision.id, currentVersion)
      onRestored()
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (isChangedElsewhere(error, ENTRY_CHANGED)) {
        setMessage(t('entity.history.changedElsewhere'))
        onRestored()
      } else if (isNotRestorable(error) || error instanceof ApiError) {
        setMessage((error as ApiError).message)
      } else {
        setMessage(t('entity.history.restoreFailed'))
      }
    } finally {
      setBusyId(null)
    }
  }

  return {
    revisions,
    status,
    setStatus,
    opened,
    busyId,
    message,
    blocked,
    setReads,
    openId,
    open,
    carriesImages,
    restore,
  }
}
