import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { discardDraft } from '../lib/localDrafts'
import { bulkDeleteFromTrash, TRASH_SELECTION_CHANGED } from './api'
import type { TrashItem } from './types'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import type { useAuth } from '../auth/useAuth'
import { keyOf } from './trashText'
import type { useTrashState } from './useTrashState'

/** Selecting rows and erasing them together: toggling, the page, clearing, starting and stopping, and the bulk erase. */
export function trashSelectionActions({
  universe,
  user,
  tn,
  load,
  page,
  pageItems,
  selectedKeys,
  selected,
  selectionLocked,
  setSelection,
  setIsSelecting,
  setBulkConfirming,
  bulkBusy,
  setBulkBusy,
  setBulkError,
  setOutcome,
  setBlocked,
  bulkWorking,
  bulkDeleteRef,
  selectPageRef,
}: ReturnType<typeof useTrashState> & {
  universe: WorkspaceContext['universe']
  user: ReturnType<typeof useAuth>['user']
  tn: ReturnType<typeof useI18n>['tn']
  load: (signal?: AbortSignal) => void
  pageItems: TrashItem[]
  selectedKeys: ReadonlySet<string>
  selected: TrashItem[]
  selectionLocked: boolean
}) {
  function toggle(item: TrashItem) {
    if (selectionLocked) return
    const next = new Set(selectedKeys)
    if (next.has(keyOf(item))) next.delete(keyOf(item))
    else next.add(keyOf(item))
    setSelection({ page, keys: next })
  }

  function selectPage() {
    setSelection({ page, keys: new Set(pageItems.map(keyOf)) })
    // Select page has nothing left to do once it has; the next step is the delete.
    requestAnimationFrame(() => bulkDeleteRef.current?.focus())
  }

  function clearSelection() {
    setSelection({ page, keys: new Set() })
    requestAnimationFrame(() => selectPageRef.current?.focus())
  }

  function stopSelecting() {
    setSelection({ page, keys: new Set() })
    setIsSelecting(false)
    setBulkConfirming(false)
    setBulkError(null)
  }

  function startSelecting() {
    setOutcome(null)
    setBlocked(null)
    setIsSelecting(true)
  }

  function askToBulkErase() {
    if (selected.length === 0) return
    setOutcome(null)
    setBlocked(null)
    setBulkError(null)
    setBulkConfirming(true)
  }

  function cancelBulkErase() {
    if (bulkBusy) return
    setBulkError(null)
    setBulkConfirming(false)
    // The question replaced the bar; the focus goes back to the button that asked, once the bar is back.
    requestAnimationFrame(() => bulkDeleteRef.current?.focus())
  }

  /**
   * Erases every selected row in one request, every one or none. A failure the list is still right about keeps the
   * selection and the question for another try; a Trash that changed underneath (409) deleted nothing, and the selection,
   * now naming rows that may not be there, is let go.
   */
  async function bulkErase() {
    if (bulkWorking.current || selected.length === 0) return
    bulkWorking.current = true
    setBulkBusy(true)
    setBulkError(null)

    try {
      const erased = await bulkDeleteFromTrash(universe.id, selected)

      // Only now that the server has erased them: exactly the recovery copies of what went - each erased entry's article,
      // each erased scene's manuscript, a story's scenes among them - and nothing else. Best effort, as for one row.
      if (user) {
        const scopes = [
          ...erased.erasedEntryIds.map((contentId) => ({ kind: 'article' as const, contentId })),
          ...erased.erasedSceneIds.map((contentId) => ({ kind: 'manuscript' as const, contentId })),
        ]
        for (const scope of scopes) {
          void discardDraft({ accountId: user.id, universeId: universe.id, ...scope }).catch(
            () => undefined,
          )
        }
      }

      stopSelecting()
      setOutcome({
        text: tn('data.trash.outcome.bulkDeleted', erased.deleted, { n: erased.deleted }),
        link: null,
      })
      load()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === TRASH_SELECTION_CHANGED) {
        stopSelecting()
        setOutcome({
          text: t('data.trash.outcome.bulkChanged'),
          link: null,
        })
        load()
      } else {
        setBulkError(t('data.trash.outcome.bulkFailed'))
      }
    } finally {
      bulkWorking.current = false
      setBulkBusy(false)
    }
  }

  return {
    toggle,
    selectPage,
    clearSelection,
    stopSelecting,
    startSelecting,
    askToBulkErase,
    cancelBulkErase,
    bulkErase,
  }
}
