import { useRef, useState, type ReactNode } from 'react'
import type { CanonBlockingFinding } from '../canon/types'
import type { Load } from '../lib/useAsyncRead'
import type { Outcome } from '../lib/outcome'
import { useConfirmFocus } from '../lib/useConfirmFocus'
import type { TrashItem, TrashPage } from './types'

/** The Trash's states: the page and its read, restoring and its confirm, erasing, selecting and the bulk erase, with their refs and focus. */
export function useTrashState() {
  const [page, setPage] = useState(1)
  const [state, setState] = useState<Load<TrashPage>>({ kind: 'loading' })
  const [restoring, setRestoring] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  // A restore that would publish again asks first (Task 012); the question sits in the row it is about.
  const [confirming, setConfirming] = useState<TrashItem | null>(null)
  const confirmRef = useRef<HTMLDivElement>(null)
  const restoreButtons = useRef(new Map<string, HTMLButtonElement>())

  // Deleting permanently asks first too, in the row; while it asks or works, nothing else in the list can start.
  const [erasing, setErasing] = useState<TrashItem | null>(null)
  const [eraseBusy, setEraseBusy] = useState(false)
  const [eraseError, setEraseError] = useState<ReactNode>(null)
  const eraseRef = useRef<HTMLDivElement>(null)
  const eraseButtons = useRef(new Map<string, HTMLButtonElement>())

  // Selecting, to delete several rows permanently together. A mode the author turns on, so ordinary browsing carries no
  // checkboxes; while it is on, the rows' own Restore and Delete permanently… step aside, so one row cannot be restored or
  // erased on its own while others are selected.
  const [isSelecting, setIsSelecting] = useState(false)
  const [selection, setSelection] = useState<{ page: number; keys: ReadonlySet<string> }>({
    page: 1,
    keys: new Set(),
  })
  const [bulkConfirming, setBulkConfirming] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)
  const bulkWorking = useRef(false)
  const bulkPanelRef = useRef<HTMLDivElement>(null)
  const bulkDeleteRef = useRef<HTMLButtonElement>(null)
  const selectPageRef = useRef<HTMLButtonElement>(null)
  const selectToggleRef = useRef<HTMLButtonElement>(null)

  useConfirmFocus(bulkConfirming, bulkPanelRef)

  // Cancelling hands the focus back to the button that asked - once it is enabled again, so after the render.
  const returnFocusTo = useRef<string | null>(null)
  const returnEraseFocusTo = useRef<string | null>(null)
  const askedBy = (asked: { current: string | null }, buttons: Map<string, HTMLButtonElement>) => {
    const id = asked.current
    asked.current = null
    return id ? buttons.get(id) : null
  }

  useConfirmFocus(confirming, confirmRef, () => askedBy(returnFocusTo, restoreButtons.current))
  useConfirmFocus(erasing, eraseRef, () => askedBy(returnEraseFocusTo, eraseButtons.current))

  return {
    page,
    setPage,
    state,
    setState,
    restoring,
    setRestoring,
    blocked,
    setBlocked,
    outcome,
    setOutcome,
    confirming,
    setConfirming,
    confirmRef,
    restoreButtons,
    erasing,
    setErasing,
    eraseBusy,
    setEraseBusy,
    eraseError,
    setEraseError,
    eraseRef,
    eraseButtons,
    isSelecting,
    setIsSelecting,
    selection,
    setSelection,
    bulkConfirming,
    setBulkConfirming,
    bulkBusy,
    setBulkBusy,
    bulkError,
    setBulkError,
    bulkWorking,
    bulkPanelRef,
    bulkDeleteRef,
    selectPageRef,
    selectToggleRef,
    returnFocusTo,
    returnEraseFocusTo,
  }
}
