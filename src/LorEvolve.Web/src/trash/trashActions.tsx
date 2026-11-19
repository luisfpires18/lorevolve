import type { ReactNode } from 'react'
import { t, tx } from '../i18n'
import type { useUniverseAccess } from '../universes/access'
import { blockingFindingsOf } from '../canon/blocked'
import { Quoted } from '../components/NameList'
import { ApiError } from '../lib/api'
import { discardDraft } from '../lib/localDrafts'
import { unpublishContent } from '../publishing/api'
import { deleteFromTrash, restoredPath, restoreFromTrash } from './api'
import { TrashKind, TrashPublication, type TrashItem } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useAuth } from '../auth/useAuth'
import { backText } from './trashText'
import type { useTrashState } from './useTrashState'
import { errorText } from '../lib/errorText'

/** One row's handlers: asking to erase and cancelling, cancelling a restore's question, restoring and erasing. */
export function trashActions({
  access,
  universe,
  refreshProjects,
  user,
  load,
  confirming,
  setConfirming,
  setRestoring,
  setBlocked,
  setOutcome,
  erasing,
  setErasing,
  eraseBusy,
  setEraseBusy,
  setEraseError,
  returnFocusTo,
  returnEraseFocusTo,
}: ReturnType<typeof useTrashState> & {
  access: ReturnType<typeof useUniverseAccess>
  universe: WorkspaceContext['universe']
  refreshProjects: WorkspaceContext['refreshProjects']
  user: ReturnType<typeof useAuth>['user']
  load: (signal?: AbortSignal) => void
}) {
  function askToErase(item: TrashItem) {
    setBlocked(null)
    setOutcome(null)
    setEraseError(null)
    setErasing(item)
  }

  function cancelErasing() {
    if (eraseBusy) return
    returnEraseFocusTo.current = erasing?.id ?? null
    setEraseError(null)
    setErasing(null)
  }

  function cancelConfirming() {
    returnFocusTo.current = confirming?.id ?? null
    setConfirming(null)
  }

  function askToRestore(item: TrashItem) {
    // Someone who cannot publish has no choice to make: the server restores whatever was selected as private (ADR 0041).
    if (item.publication === TrashPublication.None || !access.publish) {
      void restore(item)
      return
    }
    setBlocked(null)
    setOutcome(null)
    setConfirming(item)
  }

  /**
   * `keepPrivate` restores and then takes the selection back at once - the only order the API allows, since an item in
   * the Trash has no publication route. The window between the two is one round trip.
   */
  async function restore(item: TrashItem, keepPrivate = false) {
    setConfirming(null)
    setRestoring(item.id)
    setBlocked(null)
    setOutcome(null)

    try {
      await restoreFromTrash(universe.id, item)
      refreshProjects().catch(() => undefined)
      let privateNote: ReactNode = null
      if (!access.publish && item.publication !== TrashPublication.None) {
        privateNote = ` ${t('data.trash.outcome.restoredPrivately')}`
      } else if (keepPrivate) {
        try {
          await unpublishContent(
            universe.id,
            item.kind === TrashKind.Entry ? 'entry' : 'story',
            item.id,
          )
          privateNote = ` ${t('data.trash.outcome.nowPrivate')}`
        } catch {
          privateNote = ` ${t('data.trash.outcome.privateFailed')}`
        }
      }
      setOutcome({
        text: (
          <>
            {backText(item)}
            {privateNote}
          </>
        ),
        link: {
          to: restoredPath(universe.id, item),
          label: tx('data.trash.outcome.open', { name: <Quoted text={item.name} /> }),
        },
      })

      load()
    } catch (error: unknown) {
      // Nothing moved either way: a refused restore writes nothing, so the row is still in the list below and can be
      // tried again once the objection is dealt with.
      const findings = blockingFindingsOf(error)
      if (findings) {
        setBlocked(findings)
      } else {
        setOutcome({
          text: errorText(
            error,
            tx('data.trash.outcome.restoreFailed', { name: <Quoted text={item.name} /> }),
          ),
          link: null,
        })
      }
      load()
    } finally {
      setRestoring(null)
    }
  }

  /** Deletes the row the author confirmed, once. A failure leaves the row, and the question, where they were. */
  async function erase(item: TrashItem) {
    if (eraseBusy) return
    setEraseBusy(true)
    setEraseError(null)

    let erasedSceneIds: string[]
    try {
      erasedSceneIds = await deleteFromTrash(universe.id, item)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 404) {
        // Restored or deleted somewhere else meanwhile: there is nothing left here to delete.
        setErasing(null)
        setOutcome({
          text: tx('data.trash.outcome.gone', { name: <Quoted text={item.name} /> }),
          link: null,
        })
        load()
      } else {
        setEraseError(tx('data.trash.outcome.deleteFailed', { name: <Quoted text={item.name} /> }))
      }
      setEraseBusy(false)
      return
    }

    // Only now that the server has erased it: the recovery copies of unsaved writing this device kept for what went - an
    // entry's article, a scene's manuscript, every scene of a story - have nothing left to recover into. Scoped by id, so
    // no other copy is touched. Best effort, like every recovery-copy write: storage that fails never undoes the delete,
    // and a copy it could not drop is never offered, because nothing can open the scene or entry it names.
    if (user) {
      const scopes = [
        ...(item.kind === TrashKind.Entry
          ? [{ kind: 'article' as const, contentId: item.id }]
          : []),
        ...erasedSceneIds.map((contentId) => ({ kind: 'manuscript' as const, contentId })),
      ]
      for (const scope of scopes) {
        void discardDraft({ accountId: user.id, universeId: universe.id, ...scope }).catch(
          () => undefined,
        )
      }
    }

    setEraseBusy(false)
    setErasing(null)
    setOutcome({
      text: tx('data.trash.outcome.deleted', { name: <Quoted text={item.name} /> }),
      link: null,
    })
    load()
  }

  return { askToErase, cancelErasing, cancelConfirming, askToRestore, restore, erase }
}
