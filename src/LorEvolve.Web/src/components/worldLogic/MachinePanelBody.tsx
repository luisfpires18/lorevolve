import { EmptyState } from '../EmptyState'
import { SystemMachineCanvas } from '../SystemMachineCanvas'
import { SystemMachineTry } from '../SystemMachineTry'
import { t } from '../../i18n'
import { guardMark, moveState, openCount, type MachineTransition } from '../../worldLogic/machine'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { MachineNotices } from './MachineNotices'
import { MachineStates } from './MachineStates'
import { MachineTransitions } from './MachineTransitions'
import { MachineBinding } from './MachineBinding'
import { EditorSaveBar } from '../EditorSaveBar'
import { MachineDrawers } from './MachineDrawers'
import { FormMessage } from '../FormMessage'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>

/** The machine panel once the machine is read: the canvas, the states, transitions and binding, the try, and the save. */
export function MachinePanelBody({
  universeId,
  systemId,
  systemName,
  projectId,
  baseVersion,
  isDirty,
  statusId,
  stored,
  draft,
  openFindings,
  tried,
  setTried,
  rules,
  setRules,
  selected,
  setSelected,
  connecting,
  setConnecting,
  open,
  setOpen,
  errors,
  failure,
  conflict,
  saving,
  saves,
  centreRef,
  edit,
  save,
  keepMine,
  loadSaved,
  openItem,
  connect,
  newStatePlace,
}: State &
  Actions & {
    universeId: string
    systemId: string
    systemName: string
    projectId: string | null
    baseVersion: number
    isDirty: boolean
  }) {
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
      <FormMessage testId="machine-row-error">{messages.join(' ')}</FormMessage>
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
      <MachineNotices
        conflict={conflict}
        saving={saving}
        keepMine={keepMine}
        loadSaved={loadSaved}
        failure={failure}
        connecting={connecting}
        stateName={stateName}
        setConnecting={setConnecting}
      />

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

      <MachineStates
        draft={draft}
        setOpen={setOpen}
        openItem={openItem}
        newStatePlace={newStatePlace}
        counts={counts}
        rowError={rowError}
      />

      <MachineTransitions
        draft={draft}
        setOpen={setOpen}
        openItem={openItem}
        pairName={pairName}
        ruleTitle={ruleTitle}
        marks={marks}
        rowError={rowError}
      />

      <MachineBinding
        setOpen={setOpen}
        hasBinding={hasBinding}
        subjectType={subjectType}
        attribute={attribute}
        rowError={rowError}
      />

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

      <EditorSaveBar
        record
        save={{
          label: t(`${m}.saveChanges`),
          isDirty,
          isSaving: saving,
          saves,
          restingStatus: isEmpty ? t(`${m}.notSavedYet`) : t(`${m}.saved`),
          statusId,
          statusTestId: 'machine-status',
          testId: 'machine-save',
          type: 'button',
          onSave: () => void save(baseVersion),
        }}
      />

      <MachineDrawers
        universeId={universeId}
        projectId={projectId}
        open={open}
        setOpen={setOpen}
        draft={draft}
        errors={errors}
        rules={rules}
        setRules={setRules}
        setSelected={setSelected}
        edit={edit}
        openState={openState}
        openTransition={openTransition}
      />
    </div>
  )
}
