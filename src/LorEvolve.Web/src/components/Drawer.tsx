import { useEffect, useRef } from 'react'
import type { KeyboardEvent, MouseEvent, ReactNode, RefObject, SyntheticEvent } from 'react'
import { useDrawerGuard } from '../lib/drawerGuard'
import { QuietNote } from './QuietNote'

type DrawerProps = {
  /** data-testid on the dialog. */
  testId: string
  /** The h2's id and the dialog's aria-labelledby. */
  titleId: string
  title: ReactNode
  /** Drawn only when truthy. */
  eyebrow?: ReactNode
  /** After the title inside the header; the caller writes its own `p.drawer__context`. */
  context?: ReactNode
  /** Extra dialog classes, after `drawer`. */
  className?: string
  /** Extra body classes, after `drawer__body`. */
  bodyClassName?: string
  onClose: () => void
  isDirty?: boolean
  /** The guard's question when `isDirty`. */
  leaveMessage?: string
  /** Read at event time: true swallows Escape, cancel and a backdrop press. */
  isLocked?: () => boolean
  /** Present: the panel is a form. Drawer prevents the default and stops the event first. */
  onSubmit?: () => void
  noValidate?: boolean
  /** `body` makes `.drawer__body` the form and draws the footer inside it. */
  submitFrom?: 'panel' | 'body'
  busy?: boolean
  /** For callers that read the dialog. */
  dialogRef?: RefObject<HTMLDialogElement | null>
  /** Inside `footer.drawer__actions`; `close` is the guarded close, for Cancel. */
  actions: (close: () => void) => ReactNode
  children: ReactNode
}

/**
 * The drawer shell: the modal `dialog`, its head, body and actions, and the guarded Escape and backdrop. A caller keeps
 * its own focus effect and `useReturnFocus`; React runs this effect first, so the dialog is open by the time it focuses.
 */
export function Drawer({
  testId,
  titleId,
  title,
  eyebrow,
  context,
  className,
  bodyClassName,
  onClose,
  isDirty = false,
  leaveMessage = '',
  isLocked,
  onSubmit,
  noValidate,
  submitFrom = 'panel',
  busy,
  dialogRef,
  actions,
  children,
}: DrawerProps) {
  const ownRef = useRef<HTMLDialogElement>(null)
  const dialog = dialogRef ?? ownRef
  const { close, dialogProps } = useDrawerGuard(isDirty, leaveMessage, onClose)

  useEffect(() => {
    dialog.current?.showModal()
  }, [dialog])

  const guardedProps = {
    onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
      if (isLocked?.() && event.key === 'Escape') event.preventDefault()
      else dialogProps.onKeyDown(event)
    },
    onCancel(event: SyntheticEvent<HTMLDialogElement>) {
      if (isLocked?.()) event.preventDefault()
      else dialogProps.onCancel(event)
    },
    onClick(event: MouseEvent<HTMLDialogElement>) {
      if (!isLocked?.()) dialogProps.onClick(event)
    },
  }

  function submit(event: SyntheticEvent) {
    event.preventDefault()
    // A form a drawer opened from may not be a form element, but the event still travels up React's tree to it.
    event.stopPropagation()
    onSubmit?.()
  }

  const header = (
    <header className="drawer__head">
      {eyebrow ? (
        <QuietNote className="drawer__eyebrow" size="xs">
          {eyebrow}
        </QuietNote>
      ) : null}
      <h2 className="drawer__title" id={titleId}>
        {title}
      </h2>
      {context}
    </header>
  )
  const bodyClass = bodyClassName ? `drawer__body ${bodyClassName}` : 'drawer__body'
  const footer = <footer className="drawer__actions">{actions(() => void close())}</footer>

  let panel: ReactNode
  if (onSubmit && submitFrom === 'body') {
    panel = (
      <div className="drawer__panel" aria-busy={busy}>
        {header}
        <form className={bodyClass} onSubmit={submit} noValidate={noValidate}>
          {children}
          {footer}
        </form>
      </div>
    )
  } else if (onSubmit) {
    panel = (
      <form className="drawer__panel" aria-busy={busy} onSubmit={submit} noValidate={noValidate}>
        {header}
        <div className={bodyClass}>{children}</div>
        {footer}
      </form>
    )
  } else {
    panel = (
      <div className="drawer__panel" aria-busy={busy}>
        {header}
        <div className={bodyClass}>{children}</div>
        {footer}
      </div>
    )
  }

  return (
    <dialog
      className={className ? `drawer ${className}` : 'drawer'}
      ref={dialog}
      aria-labelledby={titleId}
      {...guardedProps}
      data-testid={testId}
    >
      {panel}
    </dialog>
  )
}
