import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Plus, X } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { CanonBlockNotice } from '../components/CanonBlockNotice'
import { PageHeader } from '../components/PageHeader'
import { blockingFindingsOf } from '../canon/blocked'
import type { CanonBlockingFinding } from '../canon/types'
import { useI18n } from '../i18n'
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

/** A row's problem as a sentence, with the words the author pasted isolated in their own direction. */
function Problem({ problem }: { problem: RowProblem }) {
  const { tx } = useI18n()
  return (
    <>
      {tx(problem.key, {
        subject:
          problem.subject !== undefined ? (
            <>
              “<bdi>{problem.subject}</bdi>”
            </>
          ) : (
            ''
          ),
        max: problem.max ?? '',
      })}
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
  const { t, tn, tx } = useI18n()
  const { universe, entryTypes: typesRead, refreshTypes } = useWorkspaceTypes()
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
        ? tn('lore.massCreate.leaveRows', rows.length, { n: rows.length })
        : t('lore.massCreate.leavePaste'),
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
          t('lore.massCreate.nothingCreated', {
            reason: general ?? (byRow.size > 0 ? t('lore.massCreate.fixRows') : error.message),
          }),
        )
      } else {
        setFailure(
          t('lore.massCreate.nothingCreatedKept', {
            reason: error instanceof ApiError ? error.message : t('lore.massCreate.tryAgain'),
          }),
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
      ? t('lore.massCreate.statusNone')
      : needFixing > 0
        ? tn('lore.massCreate.statusFix', needFixing, { n: needFixing })
        : tn('lore.massCreate.statusReady', rows.length, { n: rows.length })

  return (
    <article className="masscreate">
      <PageHeader
        crumb={
          <Link to={backTo} data-testid="mass-create-back">
            {t('lore.massCreate.crumb')}
          </Link>
        }
        title={t('lore.massCreate.title')}
        titleTestId="mass-create-title"
        lede={t('lore.massCreate.lede')}
      />

      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('lore.massCreate.readingTypes')}
        </p>
      ) : null}

      {load.kind === 'error' ? (
        <div className="notice notice--error" role="alert">
          <p>{t('lore.massCreate.typesFailed')}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              refreshTypes().catch(() => undefined)
            }}
          >
            {t('lore.massCreate.retry')}
          </button>
        </div>
      ) : null}

      {load.kind === 'ready' && eligible.length === 0 ? (
        <p className="callout callout--warning" data-testid="mass-create-no-types">
          {types.length === 0 ? t('lore.massCreate.noTypes') : t('lore.massCreate.allRequired')}
        </p>
      ) : null}

      {load.kind === 'ready' ? (
        <>
          <section className="masscreate__defaults" aria-label={t('lore.massCreate.defaults')}>
            <div className="masscreate__default">
              <label className="field__label" htmlFor={`${id}-default-type`}>
                {t('lore.massCreate.defaultType')}
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
                    {hasRequiredFields(type) ? t('lore.massCreate.hasRequired', { label }) : label}
                  </option>
                ))}
              </select>
            </div>

            <div className="masscreate__default">
              <span className="field__label" id={`${id}-default-status`}>
                {t('lore.massCreate.defaultStatus')}
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
                {t('lore.massCreate.applyAll')}
              </button>
            ) : null}

            {startingBlocked && startingType ? (
              <p className="field__hint masscreate__note" data-testid="mass-starting-blocked">
                {tx('lore.massCreate.startingBlocked', { name: <bdi>{startingType.name}</bdi> })}
              </p>
            ) : null}
          </section>

          <section className="masscreate__paste">
            <label className="field__label" htmlFor={`${id}-paste`}>
              {t('lore.massCreate.pasteLabel')}
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
              {t('lore.massCreate.pasteHint')}
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
                {t('lore.massCreate.addToList')}
              </button>
            </div>
          </section>

          <section className="masscreate__review" aria-labelledby={`${id}-review`}>
            <div className="masscreate__reviewhead">
              <h2 className="masscreate__heading" id={`${id}-review`}>
                {t('lore.massCreate.entriesHeading')}
              </h2>
              <span className="masscreate__count" data-testid="mass-count">
                {t('lore.massCreate.count', { rows: rows.length, max: MASS_CREATE_MAX })}
              </span>
            </div>

            {rows.length === 0 ? (
              <p className="masscreate__empty">{t('lore.massCreate.empty')}</p>
            ) : (
              <>
                <div className="masscreate__columns" aria-hidden="true">
                  <span />
                  <span>{t('lore.massCreate.columnName')}</span>
                  <span>{t('lore.massCreate.columnType')}</span>
                  <span>{t('lore.massCreate.columnStatus')}</span>
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
                            {t('lore.massCreate.rowName', { number })}
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
                            {t('lore.massCreate.rowType', { number })}
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
                                {row.typeText
                                  ? t('lore.massCreate.unknown', { text: row.typeText })
                                  : t('lore.massCreate.chooseType')}
                              </option>
                            ) : null}
                            {choices.map(({ type, label }) => (
                              <option
                                key={type.id}
                                value={type.id}
                                disabled={hasRequiredFields(type) && type.id !== row.typeId}
                              >
                                {hasRequiredFields(type)
                                  ? t('lore.massCreate.hasRequired', { label })
                                  : label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="masscreate__cell masscreate__cell--status">
                          <label
                            className="masscreate__label visually-hidden"
                            htmlFor={controlId('status', row.key)}
                          >
                            {t('lore.massCreate.rowStatus', { number })}
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
                                {row.statusText
                                  ? t('lore.massCreate.unknown', { text: row.statusText })
                                  : t('lore.massCreate.chooseStatus')}
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
                          aria-label={
                            row.name.trim()
                              ? t('lore.massCreate.removeRowNamed', {
                                  number,
                                  name: row.name.trim(),
                                })
                              : t('lore.massCreate.removeRow', { number })
                          }
                          title={t('lore.massCreate.removeRowTitle')}
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
                                {t('lore.massCreate.repeat', { row: repeatOf })}
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
                  ? t('lore.massCreate.limit', { max: MASS_CREATE_MAX })
                  : undefined
              }
              data-testid="mass-add-row"
            >
              <ActionIcon icon={Plus} />
              {t('lore.massCreate.addRow')}
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
                  ? tn('lore.massCreate.creating', rows.length, { n: rows.length })
                  : readyCount > 0
                    ? tn('lore.massCreate.create', readyCount, { n: readyCount })
                    : t('lore.massCreate.createNone')}
              </button>
              <Link className="button button--secondary" to={backTo}>
                {t('lore.massCreate.cancel')}
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
