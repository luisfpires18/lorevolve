import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { CanonBlockingFinding } from '../canon/types'
import { useI18n } from '../i18n'
import {
  MASS_CREATE_MAX,
  readPaste,
  repeatedRows,
  rowProblems,
  type MassRow,
  type MassRowInput,
  type RowField,
} from './massCreate'
import type { CanonStatusValue } from './types'
import type { EntityType } from './typeDefinitions'

/** What the API said about one row of a refused batch. */
export interface ServerProblem {
  field: RowField
  message: string
}

/** Mass create's rows: the paste box and the rows it made, their problems and repeats, and the request's outcome. */
export function useMassRows({
  types,
  typesById,
  defaultTypeId,
  defaultStatus,
  id,
}: {
  types: EntityType[]
  typesById: Map<string, EntityType>
  defaultTypeId: string
  defaultStatus: CanonStatusValue
  id: string
}) {
  const { t, tn } = useI18n()
  const [rows, setRows] = useState<MassRow[]>([])
  const nextKey = useRef(1)
  const [draft, setDraft] = useState('')
  const [pasteMessage, setPasteMessage] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [attempted, setAttempted] = useState(false)
  const [serverProblems, setServerProblems] = useState<Map<number, ServerProblem[]>>(
    () => new Map(),
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<CanonBlockingFinding[] | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isDone, setIsDone] = useState(false)
  const pendingFocus = useRef<string | null>(null)
  // Held from the press to the answer, so a second press - however quick - never sends the batch twice.
  const sending = useRef(false)

  const problems = useMemo(
    () => new Map(rows.map((row) => [row.key, rowProblems(row, typesById)])),
    [rows, typesById],
  )
  const repeats = useMemo(() => repeatedRows(rows), [rows])
  const isReady = (row: MassRow) =>
    problems.get(row.key)?.length === 0 && !serverProblems.has(row.key)
  const readyCount = rows.filter(isReady).length
  const needFixing = rows.length - readyCount

  // Moves the focus once the rows it points into have been drawn: a new row's name, or where a removed row was.
  useEffect(() => {
    if (pendingFocus.current === null) return
    document.getElementById(pendingFocus.current)?.focus()
    pendingFocus.current = null
  }, [rows])

  const controlId = (field: RowField | 'remove', key: number) => `${id}-${field}-${key}`

  /** Anything a request said about the rows is stale once they change. */
  function clearOutcome() {
    setFailure(null)
    setBlocked(null)
  }

  function append(inputs: MassRowInput[]) {
    const added = inputs.map((input) => ({ ...input, key: nextKey.current++ }))
    setRows((current) => [...current, ...added])
    clearOutcome()
    return added
  }

  /** Reads a paste - or what was typed - into rows. Anything it cannot take stays in the box, with the reason. */
  function take(text: string) {
    const result = readPaste(text, types, {
      typeId: defaultTypeId,
      status: defaultStatus,
    })

    if (result.kind === 'refused') {
      setDraft(text)
      setPasteMessage(result.message)
      return
    }

    const count = result.rows.length
    if (count === 0) {
      setPasteMessage(t('lore.massCreate.allBlank'))
      return
    }

    const room = MASS_CREATE_MAX - rows.length
    if (count > room) {
      setDraft(text)
      const held = tn('lore.massCreate.entries', count, { n: count })
      setPasteMessage(
        rows.length > 0
          ? t('lore.massCreate.tooManyRoom', { entries: held, room, max: MASS_CREATE_MAX })
          : t('lore.massCreate.tooMany', { entries: held, max: MASS_CREATE_MAX }),
      )
      return
    }

    append(result.rows.map((row) => ({ ...row, typeId: row.typeId || null })))
    setDraft('')
    setPasteMessage(null)
    setAnnouncement(tn('lore.massCreate.added', count, { n: count }))
  }

  /**
   * A paste into the empty box is the list, so it becomes rows at once and the box is ready for the next one. Into text
   * being typed it is only more text, added with Add to list. The paste itself is never stopped: it lands in the box as
   * any paste does, and a paste that cannot be taken stays there, with the reason.
   */
  function onDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const text = event.target.value
    const pasted = (event.nativeEvent as InputEvent).inputType === 'insertFromPaste'
    if (pasted && draft.trim() === '') {
      take(text)
      return
    }
    setDraft(text)
    setPasteMessage(null)
  }

  function addRow() {
    if (rows.length >= MASS_CREATE_MAX) return
    const [row] = append([
      {
        typeId: defaultTypeId || null,
        typeText: '',
        name: '',
        status: defaultStatus,
        statusText: '',
        touched: false,
      },
    ])
    pendingFocus.current = controlId('name', row.key)
  }

  function updateRow(key: number, change: Partial<MassRowInput>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)))
    setServerProblems((current) => {
      if (!current.has(key)) return current
      const next = new Map(current)
      next.delete(key)
      return next
    })
    clearOutcome()
  }

  function removeRow(key: number) {
    const at = rows.findIndex((row) => row.key === key)
    const neighbour = rows[at + 1] ?? rows[at - 1]
    setRows((current) => current.filter((row) => row.key !== key))
    setServerProblems((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
    clearOutcome()
    pendingFocus.current = neighbour ? controlId('remove', neighbour.key) : `${id}-add`
    setAnnouncement(t('lore.massCreate.removed', { number: at + 1 }))
  }

  function applyDefaults() {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        typeId: defaultTypeId || null,
        typeText: '',
        status: defaultStatus,
        statusText: '',
      })),
    )
    setServerProblems(new Map())
    clearOutcome()
    setAnnouncement(tn('lore.massCreate.applied', rows.length, { n: rows.length }))
  }

  return {
    rows,
    draft,
    pasteMessage,
    announcement,
    attempted,
    setAttempted,
    serverProblems,
    setServerProblems,
    failure,
    setFailure,
    blocked,
    setBlocked,
    isCreating,
    setIsCreating,
    isDone,
    setIsDone,
    sending,
    problems,
    repeats,
    isReady,
    readyCount,
    needFixing,
    controlId,
    take,
    onDraftChange,
    addRow,
    updateRow,
    removeRow,
    applyDefaults,
  }
}
