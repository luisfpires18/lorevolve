import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Plus, X } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { PageHeader } from '../components/PageHeader'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { bulkCreateEntities } from '../lore/api'
import { typeChoices } from '../lore/typeTree'
import {
  MASS_CREATE_MAX,
  fieldOfKey,
  hasRequiredFields,
  readPaste,
  repeatedRows,
  rowProblems,
  type MassRow,
  type MassRowInput,
  type RowField,
  type RowProblem,
} from '../lore/massCreate'
import {
  CANON_LABELS,
  CANON_ORDER,
  CanonStatus,
  type CanonStatusValue,
  type EntityType,
} from '../lore/types'
import { useWorkspaceTypes } from './useWorkspaceTypes'

type Load = { kind: 'loading' } | { kind: 'ready'; types: EntityType[] } | { kind: 'error' }

/** No types read yet: one stable empty list for what is worked out from them. */
const NO_TYPES: EntityType[] = []

/** What the API said about one row of a refused batch. */
interface ServerProblem {
  field: RowField
  message: string
}

/** What Lore is told after a mass create, so it can say how many entries arrived. */
export interface MassCreatedState {
  massCreated: number
}

const entries = (count: number) => `${count} ${count === 1 ? 'entry' : 'entries'}`
const rowsWord = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`

/** A row's problem as a sentence, with the words the author pasted isolated in their own direction. */
function Problem({ problem }: { problem: RowProblem }) {
  return (
    <>
      {problem.before}
      {problem.subject !== undefined ? (
        <>
          “<bdi>{problem.subject}</bdi>”
        </>
      ) : null}
      {problem.after}
    </>
  )
}

/**
 * Mass create: "I have 40 names. Put them in LorEvolve."
 *
 * One page, top to bottom, no steps: the defaults, a paste target, the rows to review, and one Create. What arrives is
 * only each entry's basic shell - type, name, Canon status - and everything else is added later on the entry itself.
 * The rows are the author's until they are created: a failed create keeps every one of them, and leaving asks first.
 *
 * Creation is one request and all or nothing (`POST .../entities/bulk`). The page checks every row before it lets the
 * request go, and the API checks it all again; either way a problem is shown on the row it belongs to.
 */
export default function MassCreatePage() {
  const { universe, types: typesRead, refreshTypes } = useWorkspaceTypes()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const id = useId()
  const lorePath = `/app/universes/${universe.id}/lore`

  // The universe's types, read with it.
  const load: Load =
    typesRead === 'failed'
      ? { kind: 'error' }
      : typesRead
        ? { kind: 'ready', types: typesRead }
        : { kind: 'loading' }
  const types = load.kind === 'ready' ? load.types : NO_TYPES
  const typesById = useMemo(() => new Map(types.map((type) => [type.id, type])), [types])
  // One exact type a row: every type in the hierarchy's order, named by its path.
  const choices = useMemo(() => typeChoices(types), [types])
  const eligible = types.filter((type) => !hasRequiredFields(type))

  // Opened from a Lore type, that type starts as the default, as a new entry opened there does; otherwise the first. Read
  // by id only. A type a name alone cannot create is passed over for the first one it can.
  const startingType = types.find((type) => type.id === params.get('type')) ?? null
  const startingBlocked = startingType !== null && hasRequiredFields(startingType)
  const [chosenTypeId, setChosenTypeId] = useState<string | null>(null)
  const defaultTypeId =
    chosenTypeId ?? (startingType && !startingBlocked ? startingType : eligible[0])?.id ?? ''
  const [defaultStatus, setDefaultStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const backTo = startingType ? `${lorePath}?type=${startingType.id}` : lorePath

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

  const hasWork = !isDone && (rows.length > 0 || draft.trim() !== '')
  useLeaveGuard(
    !hasWork
      ? null
      : rows.length > 0
        ? rows.length === 1
          ? '1 entry has not been created. Leave without creating it?'
          : `${rows.length} entries have not been created. Leave without creating them?`
        : 'The pasted text has not been added. Leave without it?',
  )

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
      setPasteMessage('Every line was blank, so nothing was added.')
      return
    }

    const room = MASS_CREATE_MAX - rows.length
    if (count > room) {
      setDraft(text)
      setPasteMessage(
        `That paste holds ${entries(count)}${rows.length > 0 ? `, and the list has room for ${room} more` : ''}. ` +
          `Mass create takes up to ${MASS_CREATE_MAX} at a time, so split the list and add it in parts.`,
      )
      return
    }

    append(result.rows.map((row) => ({ ...row, typeId: row.typeId || null })))
    setDraft('')
    setPasteMessage(null)
    setAnnouncement(`Added ${rowsWord(count)}.`)
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
    setAnnouncement(`Removed row ${at + 1}.`)
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
    setAnnouncement(`Applied the defaults to ${rowsWord(rows.length)}.`)
  }

  async function create() {
    if (sending.current || rows.length === 0) return
    setAttempted(true)

    const firstUnready = rows.find((row) => !isReady(row))
    if (firstUnready) {
      const field =
        problems.get(firstUnready.key)?.[0]?.field ??
        serverProblems.get(firstUnready.key)?.[0]?.field ??
        'name'
      document.getElementById(controlId(field, firstUnready.key))?.focus()
      return
    }

    sending.current = true
    setIsCreating(true)
    setFailure(null)
    setBlocked(null)

    try {
      const { created } = await bulkCreateEntities(
        universe.id,
        rows.map((row) => ({
          entityTypeId: row.typeId!,
          name: row.name.trim(),
          canonStatus: row.status!,
        })),
      )

      // Nothing is unsaved any more, so leaving asks nothing. Back to the whole of Lore, newest first, where every new
      // entry is - a type filter would hide the ones of any other type.
      setIsDone(true)
      await navigate(lorePath, {
        state: { massCreated: created.length } satisfies MassCreatedState,
      })
    } catch (error: unknown) {
      const blocking = blockingFindingsOf(error)
      if (blocking) {
        setBlocked(blocking)
      } else if (error instanceof ApiError && error.status === 400) {
        // Problems come back keyed by row, in the order the rows were sent: `entries[3].name`.
        const byRow = new Map<number, ServerProblem[]>()
        let general: string | null = null
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          const index = /^entries\[(\d+)\]/.exec(key)?.[1]
          const row = index === undefined ? undefined : rows[Number(index)]
          if (row) {
            byRow.set(row.key, [...(byRow.get(row.key) ?? []), { field: fieldOfKey(key), message }])
          } else {
            general = message
          }
        }
        setServerProblems(byRow)
        setFailure(
          `Nothing was created. ${general ?? (byRow.size > 0 ? 'Fix the rows marked below, then create them again.' : error.message)}`,
        )
      } else {
        setFailure(
          `Nothing was created. ${error instanceof ApiError ? error.message : 'Try again.'} Your rows are still here.`,
        )
      }
    } finally {
      sending.current = false
      setIsCreating(false)
    }
  }

  const unavailable = rows.length === 0 || needFixing > 0 || isCreating
  const status =
    rows.length === 0
      ? 'Nothing to create yet.'
      : needFixing > 0
        ? `${rowsWord(needFixing)} ${needFixing === 1 ? 'needs' : 'need'} a fix. Nothing is created until every row is ready.`
        : `${entries(rows.length)} ready to create.`

  return (
    <article className="masscreate">
      <PageHeader
        crumb={
          <Link to={backTo} data-testid="mass-create-back">
            Lore
          </Link>
        }
        title="Mass create"
        titleTestId="mass-create-title"
        lede="Create the basic entries now. Add articles, images, fields and relationships later."
      />

      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          Reading this world&rsquo;s types&hellip;
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>This world&rsquo;s types could not be read.</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              refreshTypes().catch(() => undefined)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {load.kind === 'ready' && eligible.length === 0 ? (
        <p className="callout callout--warning" data-testid="mass-create-no-types">
          {types.length === 0
            ? 'This world has no types yet. Add one in Types, then come back.'
            : 'Every type in this world has required fields, so its entries are created one at a time.'}
        </p>
      ) : null}

      {load.kind === 'ready' ? (
        <>
          <section className="masscreate__defaults" aria-label="Defaults">
            <div className="masscreate__default">
              <label className="field__label" htmlFor={`${id}-default-type`}>
                Default type
              </label>
              <select
                id={`${id}-default-type`}
                className="field__input field__input--select"
                value={defaultTypeId}
                onChange={(event) => setChosenTypeId(event.target.value)}
                disabled={eligible.length === 0}
                data-testid="mass-default-type"
              >
                {choices.map(({ type, label }) => (
                  <option key={type.id} value={type.id} disabled={hasRequiredFields(type)}>
                    {label}
                    {hasRequiredFields(type) ? ' (has required fields)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="masscreate__default">
              <span className="field__label" id={`${id}-default-status`}>
                Default status
              </span>
              <div
                className="segmented"
                role="group"
                aria-labelledby={`${id}-default-status`}
                data-testid="mass-default-status"
              >
                {CANON_ORDER.map((option) => (
                  <button
                    key={option}
                    className="segmented__option"
                    type="button"
                    aria-pressed={defaultStatus === option}
                    onClick={() => setDefaultStatus(option)}
                  >
                    {CANON_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            {rows.length > 0 ? (
              <button
                className="button button--text button--sm masscreate__apply"
                type="button"
                onClick={applyDefaults}
                data-testid="mass-apply-defaults"
              >
                Apply to all rows
              </button>
            ) : null}

            {startingBlocked && startingType ? (
              <p className="field__hint masscreate__note" data-testid="mass-starting-blocked">
                <bdi>{startingType.name}</bdi> has required fields, so its entries are created one
                at a time.
              </p>
            ) : null}
          </section>

          <section className="masscreate__paste">
            <label className="field__label" htmlFor={`${id}-paste`}>
              Paste names, one per line
            </label>
            <textarea
              id={`${id}-paste`}
              className="field__input field__input--area masscreate__pastearea"
              rows={5}
              value={draft}
              onChange={onDraftChange}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  if (draft.trim()) take(draft)
                }
              }}
              aria-describedby={`${id}-paste-hint${pasteMessage ? ` ${id}-paste-message` : ''}`}
              aria-invalid={pasteMessage ? true : undefined}
              aria-keyshortcuts="Control+Enter Meta+Enter"
              autoComplete="off"
              spellCheck={false}
              data-testid="mass-paste"
            />
            <p className="field__hint masscreate__hint" id={`${id}-paste-hint`}>
              Blank lines are skipped. From a spreadsheet, copy three columns in the order Type,
              Name, Status.
            </p>
            {pasteMessage ? (
              <p
                className="field__error masscreate__pastemessage"
                id={`${id}-paste-message`}
                role="alert"
                data-testid="mass-paste-message"
              >
                {pasteMessage}
              </p>
            ) : null}
            <div>
              <button
                className="button button--secondary button--sm"
                type="button"
                onClick={() => take(draft)}
                disabled={draft.trim() === ''}
                data-testid="mass-add-text"
              >
                Add to list
              </button>
            </div>
          </section>

          <section className="masscreate__review" aria-labelledby={`${id}-review`}>
            <div className="masscreate__reviewhead">
              <h2 className="masscreate__heading" id={`${id}-review`}>
                Entries
              </h2>
              <span className="masscreate__count" data-testid="mass-count">
                {rows.length} of {MASS_CREATE_MAX}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="masscreate__empty">
                Pasted names appear here to review before anything is created.
              </p>
            ) : (
              <>
                <div className="masscreate__columns" aria-hidden="true">
                  <span />
                  <span>Name</span>
                  <span>Type</span>
                  <span>Status</span>
                  <span />
                </div>
                <ol className="masscreate__rows" data-testid="mass-rows">
                  {rows.map((row, index) => {
                    const number = index + 1
                    const shown = (problems.get(row.key) ?? []).filter(
                      (problem) => problem.field !== 'name' || row.touched || attempted,
                    )
                    const fromServer = serverProblems.get(row.key) ?? []
                    const repeatOf = repeats.get(row.key)
                    const messagesId = `${id}-messages-${row.key}`
                    const hasMessages =
                      shown.length > 0 || fromServer.length > 0 || repeatOf !== undefined
                    const invalid = (field: RowField) =>
                      shown.some((problem) => problem.field === field) ||
                      fromServer.some((problem) => problem.field === field)
                        ? true
                        : undefined
                    const described = hasMessages ? messagesId : undefined

                    return (
                      <li
                        key={row.key}
                        className="masscreate__row"
                        data-state={
                          shown.length > 0 || fromServer.length > 0
                            ? 'invalid'
                            : repeatOf !== undefined
                              ? 'repeat'
                              : undefined
                        }
                        data-testid="mass-row"
                      >
                        <span className="masscreate__number" aria-hidden="true">
                          {number}
                        </span>

                        <div className="masscreate__cell masscreate__cell--name">
                          <label
                            className="masscreate__label visually-hidden"
                            htmlFor={controlId('name', row.key)}
                          >
                            Row {number} name
                          </label>
                          <input
                            id={controlId('name', row.key)}
                            className="field__input masscreate__input"
                            dir="auto"
                            value={row.name}
                            onChange={(event) => updateRow(row.key, { name: event.target.value })}
                            onBlur={() => {
                              if (!row.touched) updateRow(row.key, { touched: true })
                            }}
                            aria-invalid={invalid('name')}
                            aria-describedby={described}
                            autoComplete="off"
                            spellCheck={false}
                            data-testid="mass-row-name"
                          />
                        </div>

                        <div className="masscreate__cell masscreate__cell--type">
                          <label
                            className="masscreate__label visually-hidden"
                            htmlFor={controlId('type', row.key)}
                          >
                            <span className="visually-hidden">Row {number} </span>Type
                          </label>
                          <select
                            id={controlId('type', row.key)}
                            className="field__input field__input--select masscreate__input"
                            value={row.typeId ?? ''}
                            onChange={(event) =>
                              updateRow(row.key, { typeId: event.target.value, typeText: '' })
                            }
                            aria-invalid={invalid('type')}
                            aria-describedby={described}
                            data-testid="mass-row-type"
                          >
                            {row.typeId === null ? (
                              <option value="" disabled>
                                {row.typeText ? `Unknown: ${row.typeText}` : 'Choose a type'}
                              </option>
                            ) : null}
                            {choices.map(({ type, label }) => (
                              <option
                                key={type.id}
                                value={type.id}
                                disabled={hasRequiredFields(type) && type.id !== row.typeId}
                              >
                                {label}
                                {hasRequiredFields(type) ? ' (has required fields)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="masscreate__cell masscreate__cell--status">
                          <label
                            className="masscreate__label visually-hidden"
                            htmlFor={controlId('status', row.key)}
                          >
                            <span className="visually-hidden">Row {number} </span>Status
                          </label>
                          <select
                            id={controlId('status', row.key)}
                            className="field__input field__input--select masscreate__input"
                            value={row.status ?? ''}
                            onChange={(event) =>
                              updateRow(row.key, {
                                status: Number(event.target.value) as CanonStatusValue,
                                statusText: '',
                              })
                            }
                            aria-invalid={invalid('status')}
                            aria-describedby={described}
                            data-testid="mass-row-status"
                          >
                            {row.status === null ? (
                              <option value="" disabled>
                                {row.statusText ? `Unknown: ${row.statusText}` : 'Choose a status'}
                              </option>
                            ) : null}
                            {CANON_ORDER.map((option) => (
                              <option key={option} value={option}>
                                {CANON_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          id={controlId('remove', row.key)}
                          className="iconbutton masscreate__remove"
                          type="button"
                          aria-label={`Remove row ${number}${row.name.trim() ? `: ${row.name.trim()}` : ''}`}
                          title="Remove row"
                          onClick={() => removeRow(row.key)}
                          data-testid="mass-row-remove"
                        >
                          <X aria-hidden="true" focusable="false" strokeWidth={1.75} />
                        </button>

                        {hasMessages ? (
                          <ul
                            className="masscreate__messages"
                            id={messagesId}
                            data-testid="mass-row-messages"
                          >
                            {shown.map((problem) => (
                              <li className="masscreate__problem" key={problem.field}>
                                <Problem problem={problem} />
                              </li>
                            ))}
                            {fromServer.map((problem) => (
                              <li className="masscreate__problem" key={`server-${problem.field}`}>
                                {problem.message}
                              </li>
                            ))}
                            {repeatOf !== undefined ? (
                              <li className="masscreate__warning">
                                Same type and name as row {repeatOf}. It will be created twice.
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </>
            )}

            <button
              id={`${id}-add`}
              className="button button--secondary button--sm"
              type="button"
              onClick={addRow}
              disabled={rows.length >= MASS_CREATE_MAX}
              title={
                rows.length >= MASS_CREATE_MAX
                  ? `Mass create takes up to ${MASS_CREATE_MAX} at a time.`
                  : undefined
              }
              data-testid="mass-add-row"
            >
              <ActionIcon icon={Plus} />
              Add row
            </button>
          </section>

          {blocked ? (
            <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
          ) : null}

          {failure ? (
            <div className="notice notice--error" role="alert" data-testid="mass-create-failure">
              <p>{failure}</p>
            </div>
          ) : null}

          <footer className="actionbar masscreate__bar">
            <p className="actionbar__status" role="status" data-testid="mass-create-status">
              {status}
            </p>
            <div className="actionbar__actions">
              <button
                className="button saveaction"
                type="button"
                onClick={() => void create()}
                aria-disabled={unavailable || undefined}
                aria-busy={isCreating || undefined}
                data-testid="mass-create-submit"
              >
                <ActionIcon icon={Check} />
                {isCreating
                  ? `Creating ${entries(rows.length)}…`
                  : readyCount > 0
                    ? `Create ${entries(readyCount)}`
                    : 'Create entries'}
              </button>
              <Link className="button button--secondary" to={backTo}>
                Cancel
              </Link>
            </div>
          </footer>
        </>
      ) : null}

      <p className="visually-hidden" role="status" data-testid="mass-announcement">
        {announcement}
      </p>
    </article>
  )
}
