import { useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { bulkTrashEntities } from './api'
import type { EntityPage } from './types'
import { confirmAction } from '../lib/confirm'
import { changed } from '../lib/queryParams'
import { useSelection } from '../lib/useSelection'
import type { Dispatch, SetStateAction } from 'react'

/** Selecting the entries on the page on screen, and moving them to the Trash together. */
export function useLoreSelection({
  location,
  pageSize,
  result,
  universe,
  setReads,
}: {
  location: { search: string }
  pageSize: number
  result: EntityPage | null
  universe: { id: string }
  setReads: Dispatch<SetStateAction<number>>
}) {
  const { t, tn } = useI18n()
  // Selecting, to move entries to the Trash together. A mode the author turns on, so ordinary browsing carries no
  // checkboxes. What is selected belongs to the page on screen: another page, filter, type or size is another list, so
  // the selection is not carried into it - nothing is ever selected out of sight.
  const pageItems = result?.items ?? []
  const {
    isSelecting,
    setIsSelecting,
    selectedIds,
    toggle,
    selectPage,
    clear: clearSelection,
    stop: stopSelecting,
  } = useSelection({
    scope: [location.search, pageSize].join('|'),
    pageIds: pageItems.map((item) => item.id),
  })
  const [isTrashing, setIsTrashing] = useState(false)
  const trashing = useRef(false)
  const [trashed, setTrashed] = useState<{ text: string; list: string } | null>(null)

  const listKey = changed(new URLSearchParams(location.search), {}).toString()
  const selected = pageItems.filter((item) => selectedIds.has(item.id))

  /**
   * Moves what is selected to the Trash, all together or not at all, after one question that says what it means: out of
   * Lore, not erased, restorable. A failure leaves every entry where it was, still selected.
   */
  async function trashSelected() {
    const count = selected.length
    if (trashing.current || count === 0) return

    trashing.current = true
    try {
      const moved = await confirmAction({
        title: tn('lore.page.trash.title', count, { n: count }),
        message: tn('lore.page.trash.message', count),
        details:
          count <= 5 ? selected.map((item) => <bdi key={item.id}>{item.name}</bdi>) : undefined,
        confirmLabel: t('lore.page.trash.confirm', { n: count }),
        busyLabel: t('lore.page.trash.busy'),
        variant: 'warning',
        failure: (error) =>
          t('lore.page.trash.failure', {
            reason: error instanceof ApiError ? error.message : t('lore.page.trash.tryAgain'),
          }),
        action: async () => {
          setIsTrashing(true)
          try {
            await bulkTrashEntities(
              universe.id,
              selected.map((item) => item.id),
            )
          } finally {
            setIsTrashing(false)
          }
        },
      })
      if (!moved) return
      setTrashed({ text: tn('lore.page.trash.moved', count, { n: count }), list: listKey })
      stopSelecting()
      setReads((reads) => reads + 1)
    } finally {
      trashing.current = false
    }
  }

  // Said on the list it happened in, and still said when an emptied page falls back to the last one there is.
  const trashedNotice = trashed?.list === listKey ? trashed.text : null

  return {
    isSelecting,
    setIsSelecting,
    isTrashing,
    selectedIds,
    pageItems,
    selected,
    toggle,
    selectPage,
    clearSelection,
    stopSelecting,
    trashSelected,
    trashedNotice,
  }
}
