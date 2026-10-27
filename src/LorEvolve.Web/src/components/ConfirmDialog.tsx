import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type SyntheticEvent,
} from 'react'
import {
  currentConfirm,
  failureText,
  settleConfirm,
  subscribeConfirm,
  type ConfirmRequest,
} from '../lib/confirm'

/** Draws the confirmation on top of everything, if one is waiting. Mounted once, beside the router. */
export function ConfirmHost() {
  const current = useSyncExternalStore(subscribeConfirm, currentConfirm, () => null)
  return current ? <ConfirmDialog key={current.id} request={current} /> : null
}

function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const { options } = request
  const variant = options.variant ?? 'neutral'
  const dialog = useRef<HTMLDialogElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const titleId = useId()
  const bodyId = useId()
  // Read before the dialog takes the focus, so it can be handed back.
  const [opener] = useState(() => document.activeElement)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
    // The safe choice first: Cancel, unless confirming takes nothing away.
    ;(variant === 'neutral' ? confirmButton : cancelButton).current?.focus()
  }, [variant])

  // A failure re-enables the buttons: the focus goes back to the confirm button once it can take it, to try again.
  useEffect(() => {
    if (failure) confirmButton.current?.focus()
  }, [failure])

  function finish(confirmed: boolean) {
    // Closed before the focus moves: while it is open, everything under it is inert.
    dialog.current?.close()
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    settleConfirm(request, confirmed)
  }

  async function confirm() {
    if (running.current) return
    if (!options.action) {
      finish(true)
      return
    }
    running.current = true
    setBusy(true)
    setFailure(null)
    try {
      await options.action()
      finish(true)
    } catch (error: unknown) {
      setFailure(failureText(error, options.failure))
      running.current = false
      setBusy(false)
    }
  }

  function cancel() {
    if (!running.current) finish(false)
  }

  // Escape is taken on its key press, as the drawers take it (see `useDrawerGuard`): a browser may refuse to let a
  // second `cancel` in a row be prevented, and would then close the dialog without an answer.
  function onKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancel()
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault()
    cancel()
  }

  function onClick(event: MouseEvent<HTMLDialogElement>) {
    // Only a press on the backdrop lands on the dialog element itself: the panel fills the rest.
    if (event.target === event.currentTarget) cancel()
  }

  return (
    <dialog
      ref={dialog}
      className={`confirm confirm--${variant}`}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      aria-busy={busy || undefined}
      onKeyDown={onKeyDown}
      onCancel={onCancel}
      onClick={onClick}
      data-testid="confirm-dialog"
      data-variant={variant}
    >
      <div className="confirm__panel">
        <h2 className="confirm__title" id={titleId}>
          {options.title}
        </h2>
        <div className="confirm__body" id={bodyId}>
          {options.message ? <p className="confirm__message">{options.message}</p> : null}
          {options.details && options.details.length > 0 ? (
            <ul className="confirm__details" data-testid="confirm-dialog-details">
              {options.details.map((detail, index) => (
                <li key={index}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
        {failure ? (
          <p className="confirm__failure" role="alert" data-testid="confirm-dialog-error">
            {failure}
          </p>
        ) : null}
        <div className="confirm__actions">
          <button
            ref={confirmButton}
            className={variant === 'destructive' ? 'button button--danger' : 'button'}
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            data-testid="confirm-dialog-confirm"
          >
            {busy ? (options.busyLabel ?? options.confirmLabel) : options.confirmLabel}
          </button>
          <button
            ref={cancelButton}
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={cancel}
            data-testid="confirm-dialog-cancel"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
