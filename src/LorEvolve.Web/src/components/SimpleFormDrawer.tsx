import type { ReactNode } from 'react'
import { Drawer } from './Drawer'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'
import { errorText } from '../lib/errorText'
import { useFormSave } from '../lib/useFormSave'

interface SimpleFormDrawerProps {
  testId: string
  titleId: string
  eyebrow?: ReactNode
  title: ReactNode
  isDirty?: boolean
  leaveMessage?: string
  submitLabel: ReactNode
  /** False: the submit is only disabled while saving, with no busy state of its own. */
  showBusy?: boolean
  busyLabel?: ReactNode
  /** The submit is disabled; it is also while a save runs. */
  disabled: boolean
  submitTestId: string
  cancelTestId?: string
  /** False: a submit (Enter included) does nothing. */
  canSave: boolean
  /** A failed save's fallback words. */
  failed: string
  /** A rejection keeps the drawer open with its message, or `failed`. */
  onSave: () => Promise<unknown>
  onClose: () => void
  children: ReactNode
}

/**
 * A drawer with a few fields, one save and one message line under them: the shell of NameSummaryDrawer and
 * PickOneDrawer. Every refusal shows its own message, or `failed`; no field is marked.
 */
export function SimpleFormDrawer({
  testId,
  titleId,
  eyebrow,
  title,
  isDirty,
  leaveMessage,
  submitLabel,
  showBusy = true,
  busyLabel,
  disabled,
  submitTestId,
  cancelTestId,
  canSave,
  failed,
  onSave,
  onClose,
  children,
}: SimpleFormDrawerProps) {
  const form = useFormSave({
    needChange: null,
    failed,
    refusal: (failure) => errorText(failure, failed),
  })
  const saving = form.isSaving

  function save() {
    if (!canSave) return
    void form.save(onSave)
  }

  return (
    <Drawer
      testId={testId}
      titleId={titleId}
      eyebrow={eyebrow}
      title={title}
      isDirty={isDirty}
      leaveMessage={leaveMessage}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={submitLabel}
          {...(showBusy ? { busy: saving, busyLabel } : null)}
          disabled={disabled || saving}
          submitTestId={submitTestId}
          onCancel={close}
          cancelTestId={cancelTestId}
        />
      )}
    >
      {children}
      {form.message ? <FormMessage>{form.message}</FormMessage> : null}
    </Drawer>
  )
}
