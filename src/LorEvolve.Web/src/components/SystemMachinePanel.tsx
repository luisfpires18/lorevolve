import { useEffect, useId, useRef, useState } from 'react'
import { EmptyState } from './EmptyState'
import { SaveAction } from './SaveAction'
import { StatusBadge } from './StatusBadge'
import { SystemMachineCanvas, type MachineSelection } from './SystemMachineCanvas'
import { GuardMark, SystemMachineTry } from './SystemMachineTry'
import { t, tn, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { isChangedElsewhere } from '../lib/editConflict'
import { useLeaveGuard } from '../lib/leaveGuard'
import { getSystemMachine, listSystemRules, saveSystemMachine } from '../worldLogic/api'
import {
  addState,
  addTransition,
  docOf,
  EMPTY_MACHINE,
  guardMark,
  moveState,
  openCount,
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
  type SystemMachineDetail,
  type SystemMachineTryResult,
  type SystemRuleSummary,
} from '../worldLogic/types'
import {
  SYSTEM_CHANGED,
  m,
  type Open,
  type Errors,
  type Rules,
} from '../worldLogic/machinePanelTypes'
import { StateDrawer } from './worldLogic/StateDrawer'
import { TransitionDrawer } from './worldLogic/TransitionDrawer'
import { BindingDrawer } from './worldLogic/BindingDrawer'

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
  // The server's counts, read with the machine and again with each save: a draft edit does not move them.
  const [openFindings, setOpenFindings] = useState<SystemMachineDetail['openFindings']>([])
  const [tried, setTried] = useState<SystemMachineTryResult | null>(null)
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
        setOpenFindings(detail.openFindings)
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
      setOpenFindings(saved.openFindings)
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
  const counts = new Map(draft.states.map((state) => [state.id, openCount(openFindings, state.id)]))
  const marks = new Map((tried?.transitions ?? []).map((row) => [row.transitionId, guardMark(row)]))
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
          counts={counts}
          marks={marks}
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
            {draft.states.map((state) => {
              const count = counts.get(state.id) ?? 0
              return (
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
                    {count ? (
                      <>
                        {' · '}
                        <StatusBadge
                          step={1}
                          label={tn(`${m}.openFindings`, count, { count })}
                          testId="machine-state-row-findings"
                        />
                      </>
                    ) : null}
                  </p>
                  {rowError(state.id)}
                </li>
              )
            })}
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
                    {marks.has(transition.id) ? (
                      <>
                        {' · '}
                        <GuardMark mark={marks.get(transition.id)!} />
                      </>
                    ) : null}
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

      {/* It tries the saved machine, so it waits until there is one. */}
      {stored.states.length > 0 ? (
        <SystemMachineTry
          universeId={universeId}
          systemId={systemId}
          refresh={saves}
          result={tried}
          onResult={setTried}
        />
      ) : null}

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
          universeId={universeId}
          projectId={projectId}
          onRuleSaved={(rule) =>
            setRules((current) =>
              Array.isArray(current)
                ? current.some((each) => each.id === rule.id)
                  ? current.map((each) => (each.id === rule.id ? rule : each))
                  : [...current, rule]
                : current === null
                  ? [rule]
                  : current,
            )
          }
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
