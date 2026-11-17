import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Drawer } from './Drawer'
import { EmptyState } from './EmptyState'
import { Field } from './Field'
import { SaveAction } from './SaveAction'
import { SystemMachineCanvas, type MachineSelection } from './SystemMachineCanvas'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { getSystemMachine, listSystemRules, saveSystemMachine } from '../worldLogic/api'
import {
  addState,
  addTransition,
  docOf,
  EMPTY_MACHINE,
  moveState,
  problemAt,
  removeState,
  removeTransition,
  sameMachine,
  STATE_HEIGHT,
  STATE_WIDTH,
  toRequest,
  updateState,
  updateTransition,
  type MachineDoc,
  type MachineTransition,
  type Point,
} from '../worldLogic/machine'
import {
  MACHINE_MAX_STATES,
  MACHINE_MAX_TRANSITIONS,
  MACHINE_TEXT_MAX_LENGTH,
  type SystemMachineState,
  type SystemRuleSummary,
} from '../worldLogic/types'

const SYSTEM_CHANGED = 'system_changed'

type Open =
  | { kind: 'state'; id: string; place?: undefined }
  | { kind: 'state'; id: null; place: Point }
  | { kind: 'transition'; id: string | null }
  | { kind: 'binding' }
  | null

/** Refusals by where they belong: an item's id, or `binding`, then the property the API named ('' for the item). */
type Errors = Record<string, Record<string, string>>

type Rules = SystemRuleSummary[] | 'failed' | null

const m = 'canon.worldLogic.systems.machine'

/**
 * A System's machine on the System editor's Machine tab (ADR 0073): the canvas, the same states and transitions as
 * rows under it, and the binding, each opened in a drawer. Every edit, a drag included, changes only the draft; one
 * "Save changes" sends the whole document under the System's version, so a move never races its own save. The
 * version is shared with the name save, which is why the editor keeps the base and hears about each save.
 *
 * A save refused because the System changed keeps the drawing exactly as it is and offers both ways out. A refusal
 * that names an item is shown under its row and in its drawer's field.
 */
export function SystemMachinePanel({
  universeId,
  systemId,
  systemName,
  projectId,
  baseVersion,
  onLoaded,
  onSaved,
  onDirty,
}: {
  universeId: string
  systemId: string
  systemName: string
  projectId: string | null
  /** The version this panel's saves are written over. */
  baseVersion: number
  onLoaded: (version: number) => void
  onSaved: (from: number, to: number) => void
  onDirty: (isDirty: boolean) => void
}) {
  useI18n() // re-renders when the language changes
  const statusId = useId()
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<MachineDoc>(EMPTY_MACHINE)
  const [draft, setDraft] = useState<MachineDoc>(EMPTY_MACHINE)
  const [rules, setRules] = useState<Rules>(null)
  const [selected, setSelected] = useState<MachineSelection>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const inFlight = useRef(false)
  const centreRef = useRef<(() => Point) | null>(null)
  const latest = useRef({ onLoaded })

  useEffect(() => {
    latest.current = { onLoaded }
  })

  useEffect(() => {
    const controller = new AbortController()
    getSystemMachine(universeId, systemId, controller.signal)
      .then((detail) => {
        const doc = docOf(detail)
        setStored(doc)
        setDraft(doc)
        setLoad('ready')
        latest.current.onLoaded(detail.version)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad('error')
      })
    return () => controller.abort()
  }, [universeId, systemId, reads])

  // Every rule definition a guard may name: the universe's, and this System's project's when it has one.
  useEffect(() => {
    const controller = new AbortController()
    async function readAll() {
      const all: SystemRuleSummary[] = []
      for (let page = 1; ; page += 1) {
        const result = await listSystemRules(universeId, page, controller.signal)
        all.push(...result.items)
        if (page >= result.totalPages) return all
      }
    }
    readAll()
      .then((all) =>
        setRules(all.filter((rule) => rule.projectId === null || rule.projectId === projectId)),
      )
      .catch(() => {
        if (!controller.signal.aborted) setRules('failed')
      })
    return () => controller.abort()
  }, [universeId, projectId])

  const isDirty = load === 'ready' && !sameMachine(draft, stored)
  useLeaveGuard(isDirty ? t(`${m}.leaveGuard`) : null)

  useEffect(() => {
    onDirty(isDirty)
  }, [isDirty, onDirty])

  /** One edit of the draft. An edited item's refusal no longer stands. */
  function edit(change: (doc: MachineDoc) => MachineDoc, item?: string) {
    setDraft(change)
    if (item && errors[item]) {
      setErrors((current) => {
        const next = { ...current }
        delete next[item]
        return next
      })
    }
  }

  async function save(expectedVersion: number) {
    if (inFlight.current) return
    const sent = draft
    inFlight.current = true
    setSaving(true)
    setFailure(null)
    setErrors({})
    setConflict(false)

    try {
      const saved = await saveSystemMachine(universeId, systemId, toRequest(sent, expectedVersion))
      const next = docOf(saved)
      setStored(next)
      // Anything changed while the save was in flight is still unsaved, and stays.
      setDraft((current) => (sameMachine(current, sent) ? next : current))
      setSaves((total) => total + 1)
      onSaved(expectedVersion, saved.version)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, SYSTEM_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('canon.worldLogic.systems.editor.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        const marked: Errors = {}
        const loose: string[] = []
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          const at = problemAt(key, sent)
          if (at.item === 'machine') loose.push(message)
          else marked[at.item] = { ...marked[at.item], [at.prop]: message }
        }
        setErrors(marked)
        setFailure(loose[0] ?? (Object.keys(marked).length > 0 ? t(`${m}.invalid`) : error.message))
      } else {
        setFailure(t(`${m}.saveFailed`))
      }
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  /** Saves the draft over whatever is stored now: the current version is read first, then written over. */
  async function keepMine() {
    try {
      const current = await getSystemMachine(universeId, systemId)
      await save(current.version)
    } catch {
      setFailure(t(`${m}.saveFailed`))
    }
  }

  async function loadSaved() {
    const confirmed = await confirmAction({
      title: t(`${m}.loadSavedConfirm.title`),
      message: t(`${m}.loadSavedConfirm.message`),
      confirmLabel: t(`${m}.loadSavedConfirm.confirm`),
      variant: 'destructive',
    })
    if (!confirmed) return
    setConflict(false)
    setFailure(null)
    setErrors({})
    setOpen(null)
    setConnecting(null)
    setLoad('loading')
    setReads((count) => count + 1)
  }

  function openItem(selection: NonNullable<MachineSelection>) {
    setConnecting(null)
    setSelected(selection)
    setOpen(selection)
  }

  function connect(fromStateId: string, toStateId: string) {
    const transition: MachineTransition = {
      id: crypto.randomUUID(),
      fromStateId,
      toStateId,
      label: '',
      guardRuleId: null,
    }
    edit((doc) => addTransition(doc, transition))
    openItem({ kind: 'transition', id: transition.id })
  }

  /** Where a new state goes: the middle of the view, stepped right until it covers no state already there. */
  function newStatePlace() {
    const centre = centreRef.current?.() ?? { x: STATE_WIDTH / 2, y: STATE_HEIGHT / 2 }
    let x = Math.round(centre.x - STATE_WIDTH / 2)
    const y = Math.round(centre.y - STATE_HEIGHT / 2)
    const gap = 48
    while (
      draft.states.some(
        (state) =>
          Math.abs(state.x - x) < STATE_WIDTH + gap && Math.abs(state.y - y) < STATE_HEIGHT + gap,
      )
    ) {
      x += STATE_WIDTH + gap
    }
    return { x, y }
  }

  if (load === 'loading') {
    return (
      <p className="notice" role="status">
        {t(`${m}.loading`)}
      </p>
    )
  }

  if (load === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="machine-unavailable">
        <p>{t(`${m}.readFailed`)}</p>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            setLoad('loading')
            setReads((count) => count + 1)
          }}
        >
          {t('canon.rules.retry')}
        </button>
      </div>
    )
  }

  const stateName = new Map(draft.states.map((state) => [state.id, state.name]))
  const ruleList = Array.isArray(rules) ? rules : []
  const ruleTitle = new Map(ruleList.map((rule) => [rule.id, rule.title]))
  const pairName = (transition: MachineTransition) =>
    t(`${m}.transitionName`, {
      from: stateName.get(transition.fromStateId) ?? '',
      to: stateName.get(transition.toStateId) ?? '',
    })
  const rowError = (item: string) => {
    const messages = Object.values(errors[item] ?? {})
    return messages.length > 0 ? (
      <p className="form__message" role="alert" data-testid="machine-row-error">
        {messages.join(' ')}
      </p>
    ) : null
  }
  const { subjectType, attribute } = draft.binding
  const hasBinding = subjectType.trim() !== '' || attribute.trim() !== ''
  const isEmpty = stored.states.length === 0 && stored.binding.subjectType === ''

  const openState =
    open?.kind === 'state' && open.id !== null
      ? draft.states.find((state) => state.id === open.id)
      : undefined
  const openTransition =
    open?.kind === 'transition' && open.id !== null
      ? draft.transitions.find((transition) => transition.id === open.id)
      : undefined

  return (
    <div data-testid="machine-panel">
      {conflict ? (
        <div className="manuscript__conflict" role="alert" data-testid="machine-conflict">
          <p className="manuscript__conflicttext">{t(`${m}.conflict`)}</p>
          <div className="manuscript__conflictactions">
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => void keepMine()}
              data-testid="machine-keep-mine"
            >
              {t(`${m}.keepMine`)}
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => void loadSaved()}
              data-testid="machine-load-saved"
            >
              {t(`${m}.loadSaved`)}
            </button>
          </div>
        </div>
      ) : null}

      {failure ? (
        <p className="form__message" role="alert" data-testid="machine-error">
          {failure}
        </p>
      ) : null}

      {connecting ? (
        <div className="notice" role="status" data-testid="machine-connecting">
          <p>{t(`${m}.connecting`, { name: stateName.get(connecting) ?? '' })}</p>
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={() => setConnecting(null)}
            data-testid="machine-connecting-cancel"
          >
            {t(`${m}.cancel`)}
          </button>
        </div>
      ) : null}

      {draft.states.length > 0 ? (
        <SystemMachineCanvas
          name={systemName}
          states={draft.states}
          transitions={draft.transitions}
          selected={selected}
          connecting={connecting}
          onOpen={openItem}
          onConnectFrom={setConnecting}
          onConnect={connect}
          onMove={(id, x, y) => edit((doc) => moveState(doc, id, x, y), id)}
          centreRef={centreRef}
        />
      ) : (
        <EmptyState
          title={t(`${m}.empty.title`)}
          hint={t(`${m}.empty.hint`)}
          testId="machine-empty"
        />
      )}

      <section className="machinepanel__group">
        <h2 className="sectionrule">{t(`${m}.states`)}</h2>
        {draft.states.length > 0 ? (
          <ul className="rulelist" data-testid="machine-state-rows">
            {draft.states.map((state) => (
              <li
                className="rulerow"
                key={state.id}
                data-testid="machine-state-row"
                data-state-id={state.id}
              >
                <button
                  className="rulerow__title rulerow__toggle"
                  type="button"
                  aria-label={t(`${m}.editState`, { name: state.name })}
                  onClick={() => openItem({ kind: 'state', id: state.id })}
                  data-testid="machine-state-open"
                >
                  <bdi>{state.name}</bdi>
                </button>
                <p className="rulerow__meta">
                  {t(`${m}.value`, { value: state.value })}
                  {state.initial ? ` · ${t(`${m}.initial`)}` : null}
                </p>
                {rowError(state.id)}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="form__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={draft.states.length >= MACHINE_MAX_STATES}
            onClick={() => setOpen({ kind: 'state', id: null, place: newStatePlace() })}
            data-testid="machine-add-state"
          >
            {t(`${m}.addState`)}
          </button>
        </div>
      </section>

      <section className="machinepanel__group">
        <h2 className="sectionrule">{t(`${m}.transitions`)}</h2>
        {draft.transitions.length > 0 ? (
          <ul className="rulelist" data-testid="machine-transition-rows">
            {draft.transitions.map((transition) => {
              const name = transition.label.trim() || pairName(transition)
              return (
                <li
                  className="rulerow"
                  key={transition.id}
                  data-testid="machine-transition-row"
                  data-transition-id={transition.id}
                >
                  <button
                    className="rulerow__title rulerow__toggle"
                    type="button"
                    aria-label={t(`${m}.editTransition`, { name })}
                    onClick={() => openItem({ kind: 'transition', id: transition.id })}
                    data-testid="machine-transition-open"
                  >
                    <bdi>{name}</bdi>
                  </button>
                  <p className="rulerow__meta">
                    {pairName(transition)} ·{' '}
                    {transition.guardRuleId
                      ? t(`${m}.guard`, {
                          title: ruleTitle.get(transition.guardRuleId) ?? t(`${m}.unknownGuard`),
                        })
                      : t(`${m}.noGuard`)}
                  </p>
                  {rowError(transition.id)}
                </li>
              )
            })}
          </ul>
        ) : null}
        {draft.states.length === 1 ? (
          <p className="field__hint">{t(`${m}.needTwoStates`)}</p>
        ) : null}
        <div className="form__actions">
          <button
            className="button button--secondary"
            type="button"
            disabled={
              draft.states.length < 2 || draft.transitions.length >= MACHINE_MAX_TRANSITIONS
            }
            onClick={() => setOpen({ kind: 'transition', id: null })}
            data-testid="machine-add-transition"
          >
            {t(`${m}.addTransition`)}
          </button>
        </div>
      </section>

      <section className="machinepanel__group">
        <h2 className="sectionrule">{t(`${m}.binding`)}</h2>
        <ul className="rulelist">
          <li className="rulerow" data-testid="machine-binding-row">
            <button
              className="rulerow__title rulerow__toggle"
              type="button"
              aria-label={t(`${m}.editBinding`)}
              onClick={() => setOpen({ kind: 'binding' })}
              data-testid="machine-binding-open"
            >
              {t(`${m}.binding`)}
            </button>
            <p className="rulerow__meta" dir="auto">
              {hasBinding
                ? t(`${m}.bindingSet`, { subjectType, attribute })
                : t(`${m}.bindingUnset`)}
            </p>
            {rowError('binding')}
          </li>
        </ul>
      </section>

      <div className="manuscript__bar idea__bar">
        <div className="idea__actions">
          <SaveAction
            label={t(`${m}.saveChanges`)}
            isDirty={isDirty}
            isSaving={saving}
            saves={saves}
            restingStatus={isEmpty ? t(`${m}.notSavedYet`) : t(`${m}.saved`)}
            statusId={statusId}
            statusTestId="machine-status"
            testId="machine-save"
            type="button"
            onSave={() => void save(baseVersion)}
          />
        </div>
      </div>

      {open?.kind === 'state' && (open.id === null || openState) ? (
        <StateDrawer
          key={open.id ?? 'new'}
          state={openState ?? null}
          place={open.place ?? null}
          isFirst={draft.states.length === 0}
          errors={openState ? errors[openState.id] : undefined}
          onApply={(values) => {
            if (openState) {
              edit((doc) => updateState(doc, openState.id, values), openState.id)
            } else {
              const id = crypto.randomUUID()
              edit((doc) => addState(doc, { id, ...values }))
              setSelected({ kind: 'state', id })
            }
            setOpen(null)
          }}
          onDelete={
            openState
              ? () => {
                  edit((doc) => removeState(doc, openState.id), openState.id)
                  setOpen(null)
                }
              : undefined
          }
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'transition' && (open.id === null || openTransition) ? (
        <TransitionDrawer
          key={open.id ?? 'new'}
          transition={openTransition ?? null}
          states={draft.states}
          rules={rules}
          errors={openTransition ? errors[openTransition.id] : undefined}
          onApply={(values) => {
            if (openTransition) {
              edit((doc) => updateTransition(doc, openTransition.id, values), openTransition.id)
            } else {
              const id = crypto.randomUUID()
              edit((doc) => addTransition(doc, { id, ...values }))
              setSelected({ kind: 'transition', id })
            }
            setOpen(null)
          }}
          onDelete={
            openTransition
              ? () => {
                  edit((doc) => removeTransition(doc, openTransition.id), openTransition.id)
                  setOpen(null)
                }
              : undefined
          }
          onClose={() => setOpen(null)}
        />
      ) : null}

      {open?.kind === 'binding' ? (
        <BindingDrawer
          binding={draft.binding}
          errors={errors.binding}
          onApply={(binding) => {
            edit((doc) => ({ ...doc, binding }), 'binding')
            setOpen(null)
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  )
}

/** A drawer's Add or Save, Delete for an item that exists, and Cancel. */
function DrawerActions({
  close,
  isNew,
  onDelete,
  testId,
}: {
  close: () => void
  isNew: boolean
  onDelete?: () => void
  testId: string
}) {
  return (
    <>
      <button className="button" type="submit" data-testid={`${testId}-apply`}>
        {isNew ? t(`${m}.add`) : t(`${m}.save`)}
      </button>
      <button
        className="button button--secondary"
        type="button"
        onClick={close}
        data-testid={`${testId}-cancel`}
      >
        {t(`${m}.cancel`)}
      </button>
      {onDelete ? (
        <button
          className="button button--danger"
          type="button"
          onClick={onDelete}
          data-testid={`${testId}-delete`}
        >
          {t(`${m}.delete`)}
        </button>
      ) : null}
    </>
  )
}

/** The message a field shows: the drawer's own check first, then what the last refused save said about it. */
function errorOf(
  local: Record<string, string>,
  saved: Record<string, string> | undefined,
  prop: string,
) {
  return local[prop] ?? saved?.[prop]
}

function textInput(
  value: string,
  onChange: (next: string) => void,
  placeholder: string,
  testId: string,
  required = false,
) {
  return (control: {
    id: string
    'aria-describedby'?: string
    'aria-invalid'?: true
  }): ReactNode => (
    <input
      id={control.id}
      className="field__input"
      type="text"
      dir="auto"
      value={value}
      maxLength={MACHINE_TEXT_MAX_LENGTH}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={control['aria-invalid']}
      aria-describedby={control['aria-describedby']}
      aria-required={required || undefined}
      data-testid={testId}
    />
  )
}

/** Puts the focus on the drawer's first field, and back on whatever opened it once it closes. */
function useDrawerFocus(dialog: RefObject<HTMLDialogElement | null>) {
  useReturnFocus()
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>('input, select')?.focus()
  }, [dialog])
}

function StateDrawer({
  state,
  place,
  isFirst,
  errors,
  onApply,
  onDelete,
  onClose,
}: {
  state: SystemMachineState | null
  place: Point | null
  isFirst: boolean
  errors?: Record<string, string>
  onApply: (values: Omit<SystemMachineState, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [initial] = useState(() => ({
    name: state?.name ?? '',
    value: state?.value ?? '',
    x: String(state?.x ?? place?.x ?? 0),
    y: String(state?.y ?? place?.y ?? 0),
    initial: state?.initial ?? isFirst,
  }))
  const [form, setForm] = useState(initial)
  const [local, setLocal] = useState<Record<string, string>>({})
  useDrawerFocus(dialog)

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const number = (text: string) => (Number.isFinite(Number(text)) ? Number(text) : 0)

  function apply() {
    const missing: Record<string, string> = {}
    if (form.name.trim() === '') missing.name = t(`${m}.nameRequired`)
    if (form.value.trim() === '') missing.value = t(`${m}.valueRequired`)
    setLocal(missing)
    if (Object.keys(missing).length > 0) {
      dialog.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    onApply({
      name: form.name,
      value: form.value,
      x: number(form.x),
      y: number(form.y),
      initial: form.initial,
    })
  }

  async function remove() {
    if (!state || !onDelete) return
    const confirmed = await confirmAction({
      title: t(`${m}.deleteState.title`, { name: state.name }),
      message: t(`${m}.deleteState.message`),
      confirmLabel: t(`${m}.deleteState.confirm`),
      variant: 'destructive',
    })
    if (confirmed) onDelete()
  }

  return (
    <Drawer
      testId="machine-state-drawer"
      titleId={titleId}
      title={state ? state.name : t(`${m}.newState`)}
      dialogRef={dialog}
      isDirty={isDirty}
      leaveMessage={t(`${m}.leaveGuard`)}
      onClose={onClose}
      onSubmit={apply}
      noValidate
      actions={(close) => (
        <DrawerActions
          close={close}
          isNew={!state}
          onDelete={onDelete ? () => void remove() : undefined}
          testId="machine-state"
        />
      )}
    >
      <Field label={t(`${m}.fields.name`)} error={errorOf(local, errors, 'name')}>
        {textInput(
          form.name,
          (name) => setForm((current) => ({ ...current, name })),
          t(`${m}.placeholders.name`),
          'machine-state-name',
          true,
        )}
      </Field>
      <Field
        label={t(`${m}.fields.value`)}
        hint={t(`${m}.fields.valueHint`)}
        error={errorOf(local, errors, 'value')}
      >
        {textInput(
          form.value,
          (value) => setForm((current) => ({ ...current, value })),
          t(`${m}.placeholders.value`),
          'machine-state-value',
          true,
        )}
      </Field>
      <Field
        name="machine-state-x"
        label={t(`${m}.fields.x`)}
        type="number"
        step="1"
        inputMode="numeric"
        value={form.x}
        onChange={(event) => setForm((current) => ({ ...current, x: event.target.value }))}
        error={errors?.x}
        data-testid="machine-state-x"
      />
      <Field
        name="machine-state-y"
        label={t(`${m}.fields.y`)}
        type="number"
        step="1"
        inputMode="numeric"
        value={form.y}
        onChange={(event) => setForm((current) => ({ ...current, y: event.target.value }))}
        error={errors?.y}
        data-testid="machine-state-y"
      />
      <label className="check">
        <input
          type="checkbox"
          checked={form.initial}
          onChange={(event) =>
            setForm((current) => ({ ...current, initial: event.target.checked }))
          }
          data-testid="machine-state-initial"
        />
        <span>{t(`${m}.fields.initial`)}</span>
      </label>
    </Drawer>
  )
}

function TransitionDrawer({
  transition,
  states,
  rules,
  errors,
  onApply,
  onDelete,
  onClose,
}: {
  transition: MachineTransition | null
  states: SystemMachineState[]
  rules: Rules
  errors?: Record<string, string>
  onApply: (values: Omit<MachineTransition, 'id'>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [initial] = useState(() => ({
    fromStateId: transition?.fromStateId ?? states[0]?.id ?? '',
    toStateId: transition?.toStateId ?? states[1]?.id ?? '',
    label: transition?.label ?? '',
    guardRuleId: transition?.guardRuleId ?? '',
  }))
  const [form, setForm] = useState(initial)
  useDrawerFocus(dialog)

  const isDirty = JSON.stringify(form) !== JSON.stringify(initial)
  const ruleList = Array.isArray(rules) ? rules : []
  const unknownGuard =
    form.guardRuleId !== '' && !ruleList.some((rule) => rule.id === form.guardRuleId)

  async function remove() {
    if (!onDelete) return
    const confirmed = await confirmAction({
      title: t(`${m}.deleteTransition.title`),
      message: t(`${m}.deleteTransition.message`),
      confirmLabel: t(`${m}.deleteTransition.confirm`),
      variant: 'destructive',
    })
    if (confirmed) onDelete()
  }

  const stateSelect =
    (key: 'fromStateId' | 'toStateId', testId: string) =>
    (control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }) => (
      <select
        id={control.id}
        className="field__input field__input--select"
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        aria-invalid={control['aria-invalid']}
        aria-describedby={control['aria-describedby']}
        data-testid={testId}
      >
        {states.map((state) => (
          <option key={state.id} value={state.id}>
            {state.name}
          </option>
        ))}
      </select>
    )

  return (
    <Drawer
      testId="machine-transition-drawer"
      titleId={titleId}
      title={
        transition
          ? transition.label.trim() ||
            t(`${m}.transitionName`, {
              from: states.find((state) => state.id === transition.fromStateId)?.name ?? '',
              to: states.find((state) => state.id === transition.toStateId)?.name ?? '',
            })
          : t(`${m}.newTransition`)
      }
      dialogRef={dialog}
      isDirty={isDirty}
      leaveMessage={t(`${m}.leaveGuard`)}
      onClose={onClose}
      onSubmit={() =>
        onApply({
          fromStateId: form.fromStateId,
          toStateId: form.toStateId,
          label: form.label,
          guardRuleId: form.guardRuleId === '' ? null : form.guardRuleId,
        })
      }
      noValidate
      actions={(close) => (
        <DrawerActions
          close={close}
          isNew={!transition}
          onDelete={onDelete ? () => void remove() : undefined}
          testId="machine-transition"
        />
      )}
    >
      <Field label={t(`${m}.fields.from`)} error={errors?.fromstateid}>
        {stateSelect('fromStateId', 'machine-transition-from')}
      </Field>
      <Field label={t(`${m}.fields.to`)} error={errors?.tostateid}>
        {stateSelect('toStateId', 'machine-transition-to')}
      </Field>
      <Field label={t(`${m}.fields.label`)} error={errors?.label}>
        {textInput(
          form.label,
          (label) => setForm((current) => ({ ...current, label })),
          t(`${m}.placeholders.label`),
          'machine-transition-label',
        )}
      </Field>
      <Field
        label={t(`${m}.fields.guard`)}
        hint={rules === 'failed' ? t(`${m}.rulesFailed`) : t(`${m}.fields.guardHint`)}
        error={errors?.guardruleid}
      >
        {(control) => (
          <select
            id={control.id}
            className="field__input field__input--select"
            value={form.guardRuleId}
            disabled={rules === 'failed'}
            onChange={(event) =>
              setForm((current) => ({ ...current, guardRuleId: event.target.value }))
            }
            aria-invalid={control['aria-invalid']}
            aria-describedby={control['aria-describedby']}
            data-testid="machine-transition-guard"
          >
            <option value="">{t(`${m}.noGuard`)}</option>
            {ruleList.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.title}
              </option>
            ))}
            {unknownGuard ? (
              <option value={form.guardRuleId}>{t(`${m}.unknownGuard`)}</option>
            ) : null}
          </select>
        )}
      </Field>
    </Drawer>
  )
}

function BindingDrawer({
  binding,
  errors,
  onApply,
  onClose,
}: {
  binding: MachineDoc['binding']
  errors?: Record<string, string>
  onApply: (binding: MachineDoc['binding']) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [form, setForm] = useState(binding)
  useDrawerFocus(dialog)

  return (
    <Drawer
      testId="machine-binding-drawer"
      titleId={titleId}
      title={t(`${m}.binding`)}
      context={<p className="drawer__context">{t(`${m}.fields.bindingHint`)}</p>}
      dialogRef={dialog}
      isDirty={JSON.stringify(form) !== JSON.stringify(binding)}
      leaveMessage={t(`${m}.leaveGuard`)}
      onClose={onClose}
      onSubmit={() => onApply(form)}
      noValidate
      actions={(close) => <DrawerActions close={close} isNew={false} testId="machine-binding" />}
    >
      <Field label={t(`${m}.fields.subjectType`)} error={errors?.subjecttype}>
        {textInput(
          form.subjectType,
          (subjectType) => setForm((current) => ({ ...current, subjectType })),
          t(`${m}.placeholders.subjectType`),
          'machine-binding-subject-type',
        )}
      </Field>
      <Field label={t(`${m}.fields.attribute`)} error={errors?.attribute}>
        {textInput(
          form.attribute,
          (attribute) => setForm((current) => ({ ...current, attribute })),
          t(`${m}.placeholders.attribute`),
          'machine-binding-attribute',
        )}
      </Field>
    </Drawer>
  )
}
