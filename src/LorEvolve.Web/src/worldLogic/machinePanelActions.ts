import type { MachineSelection } from '../components/SystemMachineCanvas'
import { t } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { isChangedElsewhere } from '../lib/editConflict'
import { getSystemMachine, saveSystemMachine } from './api'
import {
  addTransition,
  docOf,
  problemAt,
  sameMachine,
  STATE_HEIGHT,
  STATE_WIDTH,
  toRequest,
  type MachineDoc,
  type MachineTransition,
} from './machine'
import type { useMachinePanelState } from './useMachinePanelState'
import { SYSTEM_CHANGED, m, type Errors } from './machinePanelTypes'

/** The machine panel's handlers: editing the draft, saving it, the two ways out of a conflict, and opening an item. */
export function machinePanelActions({
  universeId,
  systemId,
  onSaved,
  draft,
  setDraft,
  setStored,
  setOpenFindings,
  setLoad,
  setReads,
  setSelected,
  setConnecting,
  setOpen,
  errors,
  setErrors,
  setFailure,
  setConflict,
  setSaving,
  setSaves,
  inFlight,
  centreRef,
}: ReturnType<typeof useMachinePanelState> & {
  universeId: string
  systemId: string
  onSaved: (from: number, to: number) => void
}) {
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

  return { edit, save, keepMine, loadSaved, openItem, connect, newStatePlace }
}
