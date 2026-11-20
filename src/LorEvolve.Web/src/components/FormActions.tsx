import { useContext } from 'react'
import type { ReactNode, Ref } from 'react'
import { useI18n } from '../i18n'
import { DrawerLockContext } from '../lib/drawerGuard'
import type { ButtonSize } from '../lib/buttonClass'
import { Button } from './Button'

interface FormActionsProps {
  /** Words at rest. Omitted: no submit (a Close-only drawer). */
  submitLabel?: ReactNode
  /** While true: the submit is busy (aria-busy, disabled) and says busyLabel, which ends in "…". */
  busy?: boolean
  busyLabel?: ReactNode
  /** Any other reason the submit cannot go. */
  disabled?: boolean
  /** `danger` for a destructive confirm. */
  submitTone?: 'primary' | 'danger'
  /** Given: the submit is a plain button calling it. Absent: the form's own submit. */
  onSubmit?: () => void
  submitTestId?: string
  submitRef?: Ref<HTMLButtonElement>
  /** Given: a secondary Cancel (or Close) button. In a Drawer it is the guarded close. */
  onCancel?: () => void
  /** `cancel` (the default) or `close`, a drawer with nothing to save. */
  dismiss?: 'cancel' | 'close'
  /** Replaces the Cancel words: "Keep it". */
  cancelLabel?: ReactNode
  /** Cancel is disabled while busy. Default: it stays enabled, except inside a drawer whose save is in flight. */
  lockCancel?: boolean
  cancelTestId?: string
  /** Given: a danger-quiet button after Cancel, disabled while busy. */
  onDelete?: () => void
  deleteLabel?: ReactNode
  deleteTestId?: string
  /** `danger-quiet` (the default): this Delete opens a confirm. `danger` only when no confirm follows. */
  deleteTone?: 'danger' | 'danger-quiet'
  /** `sm` for an inline editor. All buttons share it. */
  size?: ButtonSize
  /** Wraps in `.form__actions`, a form's own footer. Default: a fragment, the host has its layout. */
  inline?: boolean
  /** With `inline`: a placement class kept from the screen. */
  className?: string
  /** While busy every button is `aria-disabled`, not `disabled`, so the focus stays on it (the Trash confirms). */
  softDisable?: boolean
  /** Extra buttons or a status line between the submit and Cancel. */
  children?: ReactNode
}

/**
 * The Save and Cancel footer of a drawer, form, confirm or inline editor: submit, extras, Cancel or
 * Close, Delete. Catalogue: `docs/design/ui-components.md`.
 */
export function FormActions({
  submitLabel,
  busy,
  busyLabel,
  disabled,
  submitTone = 'primary',
  onSubmit,
  submitTestId,
  submitRef,
  onCancel,
  dismiss = 'cancel',
  cancelLabel,
  lockCancel,
  cancelTestId,
  onDelete,
  deleteLabel,
  deleteTestId,
  deleteTone = 'danger-quiet',
  size,
  inline,
  className,
  softDisable,
  children,
}: FormActionsProps) {
  const { t } = useI18n()
  const drawerLocked = useContext(DrawerLockContext)
  const soft = softDisable ? { 'aria-disabled': busy || undefined } : null
  const buttons = (
    <>
      {submitLabel !== undefined ? (
        <Button
          type={onSubmit ? 'button' : 'submit'}
          tone={submitTone}
          size={size}
          {...(soft ?? { busy, busyLabel })}
          disabled={disabled}
          onClick={onSubmit}
          data-testid={submitTestId}
          ref={submitRef}
        >
          {soft && busy && busyLabel !== undefined ? busyLabel : submitLabel}
        </Button>
      ) : null}
      {children}
      {onCancel ? (
        <Button
          tone="secondary"
          size={size}
          {...soft}
          disabled={(lockCancel && busy) || drawerLocked}
          onClick={onCancel}
          data-testid={cancelTestId}
        >
          {cancelLabel ?? t(dismiss === 'close' ? 'shell.actions.close' : 'shell.actions.cancel')}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          tone={deleteTone}
          size={size}
          {...soft}
          disabled={!soft && busy}
          onClick={onDelete}
          data-testid={deleteTestId}
        >
          {deleteLabel}
        </Button>
      ) : null}
    </>
  )
  return inline ? (
    <div className={className ? `actions form__actions ${className}` : 'actions form__actions'}>
      {buttons}
    </div>
  ) : (
    buttons
  )
}
