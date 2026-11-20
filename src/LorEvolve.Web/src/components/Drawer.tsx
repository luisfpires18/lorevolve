import { useEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject, SyntheticEvent } from 'react'
import { DrawerLockContext, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { QuietNote } from './QuietNote'

type DrawerProps = {
  /** data-testid on the dialog. */
  testId: string
  /** The h2's id and the dialog's aria-labelledby. */
  titleId: string
  title: ReactNode
  /** Drawn only when truthy. */
  eyebrow?: ReactNode
  /** After the title inside the header; the caller passes a `QuietNote` with `className="drawer__context"`. */
  context?: ReactNode
  /** Extra dialog classes, after `drawer`. */
  className?: string
  /** Extra body classes, after `drawer__body`. */
  bodyClassName?: string
  onClose: () => void
  isDirty?: boolean
  /** The guard's question when `isDirty`. */
  leaveMessage?: string
  /** Read at event time: true locks the drawer as `busy` does, for a flag React has not rendered yet. */
  isLocked?: () => boolean
  /** Focused right after the dialog opens: a ref, or a selector inside the dialog. Absent: the browser's choice. */
  initialFocus?: RefObject<HTMLElement | null> | string
  /** False: the caller puts the focus back itself. Default: the opener gets it back on close. */
  returnFocus?: boolean
  /** Present: the panel is a form. Drawer prevents the default and stops the event first. */
  onSubmit?: () => void
  noValidate?: boolean
  /** `body` makes `.drawer__body` the form and draws the footer inside it. */
  submitFrom?: 'panel' | 'body'
  /** A save in flight: `aria-busy`, and Escape, the backdrop and Cancel do nothing until it ends. */
  busy?: boolean
  /** For callers that read the dialog. */
  dialogRef?: RefObject<HTMLDialogElement | null>
  /** Inside `footer.drawer__actions`; `close` is the guarded close, for Cancel. */
  actions: (close: () => void) => ReactNode
  children: ReactNode
}

/**
 * The drawer shell: the modal `dialog`, its head, body and actions, the guarded Escape and backdrop, the lock while a
 * save is in flight, and the focus: `initialFocus` on open, the opener again on close. React runs this effect before a
 * caller's, so a caller's own later focus move still wins.
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
  initialFocus,
  returnFocus = true,
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
  const locked = () => Boolean(busy) || Boolean(isLocked?.())
  const { close, dialogProps } = useDrawerGuard(isDirty, leaveMessage, onClose, locked)
  useReturnFocus(returnFocus)
  const [firstFocus] = useState(() => initialFocus)

  useEffect(() => {
    dialog.current?.showModal()
    const target =
      typeof firstFocus === 'string'
        ? dialog.current?.querySelector<HTMLElement>(firstFocus)
        : firstFocus?.current
    target?.focus()
  }, [dialog, firstFocus])

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
  const footer = <footer className="actions drawer__actions">{actions(() => void close())}</footer>

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
      {...dialogProps}
      data-testid={testId}
    >
      <DrawerLockContext.Provider value={Boolean(busy)}>{panel}</DrawerLockContext.Provider>
    </dialog>
  )
}
