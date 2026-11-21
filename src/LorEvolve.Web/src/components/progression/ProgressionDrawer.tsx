import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import { Drawer } from '../Drawer'
import type { Progression } from '../../progression/types'
import { ProgressionConflict } from './ProgressionConflict'

/** What the era and item drawers' state hooks both give. */
interface ProgressionFormState<Draft> {
  nameInput: RefObject<HTMLInputElement | null>
  saveButton: RefObject<HTMLButtonElement | null>
  setBase: Dispatch<SetStateAction<Progression>>
  setDraft: Dispatch<SetStateAction<Draft>>
  message: string | null
  isSaving: boolean
  conflict: boolean
  setConflict: Dispatch<SetStateAction<boolean>>
}

/**
 * The era and item drawers' shell: the drawer focused on the name, the refused save's message, the changed-elsewhere
 * notice and the Save and Cancel footer. `name` (`era`, `form`, `ability`, `appearance`) makes the test ids
 * `${name}-form`, `${name}-error`, `${name}-conflict` and `save-${name}`.
 */
export function ProgressionDrawer<Draft>({
  name,
  universeId,
  entityId,
  state,
  titleId,
  eyebrow,
  title,
  isDirty,
  leaveMessage,
  submitLabel,
  busyLabel,
  cancelTestId,
  conflict,
  onClose,
  onSave,
  children,
}: {
  name: string
  universeId: string
  entityId: string
  state: ProgressionFormState<Draft>
  titleId: string
  eyebrow: string
  title: string
  isDirty: boolean
  leaveMessage: string
  submitLabel: string
  busyLabel: string
  cancelTestId?: string
  /** ProgressionConflict's own words and reads. */
  conflict: {
    what: string
    names: (latest: Progression) => { id: string; name: string }[]
    draftFrom: (latest: Progression) => Draft
    onUseLatest?: (draft: Draft) => void
  }
  onClose: () => void
  onSave: () => void
  children: ReactNode
}) {
  return (
    <Drawer
      initialFocus={state.nameInput}
      testId={`${name}-form`}
      titleId={titleId}
      eyebrow={eyebrow}
      title={title}
      isDirty={isDirty}
      leaveMessage={leaveMessage}
      busy={state.isSaving}
      onClose={onClose}
      onSubmit={onSave}
      message={state.message}
      messageTestId={`${name}-error`}
      actions={{
        submitLabel,
        busyLabel,
        submitTestId: `save-${name}`,
        submitRef: state.saveButton,
        cancelTestId,
      }}
    >
      {state.conflict ? (
        <ProgressionConflict
          universeId={universeId}
          entityId={entityId}
          testId={`${name}-conflict`}
          {...conflict}
          setBase={state.setBase}
          setDraft={state.setDraft}
          setConflict={state.setConflict}
          nameInput={state.nameInput}
          saveButton={state.saveButton}
        />
      ) : null}

      {children}
    </Drawer>
  )
}
