import { useEffect, useId, useRef, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { FeedbackKind, sendFeedback, type FeedbackKindValue } from '../feedback/api'

/**
 * Report a bug or ask for a feature, from any signed-in page: a small button at the window's corner opens a dialog, and what
 * is sent goes to the Admin with the path of the page it was sent from - nothing typed into that page, and no query.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [thanked, setThanked] = useState(false)

  return (
    <>
      <button
        className="feedbackbutton"
        type="button"
        onClick={() => {
          setThanked(false)
          setOpen(true)
        }}
        aria-haspopup="dialog"
        data-testid="feedback-open"
      >
        <MessageSquareWarning aria-hidden="true" focusable="false" strokeWidth={1.75} />
        <span>Feedback</span>
      </button>
      {thanked ? (
        <p className="feedbackbutton__thanks" role="status" data-testid="feedback-sent">
          Thanks. Your report was sent.
        </p>
      ) : null}
      {open ? (
        <FeedbackDialog
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false)
            setThanked(true)
          }}
        />
      ) : null}
    </>
  )
}

function FeedbackDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const textId = useId()
  const { pathname } = useLocation()
  useReturnFocus()
  const [kind, setKind] = useState<FeedbackKindValue>(FeedbackKind.Bug)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const { close, dialogProps } = useDrawerGuard(
    text.trim() !== '' && !sending,
    'This report has not been sent. Leave without sending it?',
    onClose,
  )

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById(textId)?.focus()
  }, [textId])

  async function send() {
    if (text.trim() === '') {
      setError('Describe it in a few words.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await sendFeedback(kind, text.trim(), pathname)
      onSent()
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (Object.values(failure.fieldErrors)[0] ?? failure.message)
          : 'That could not be sent. Try again.',
      )
      setSending(false)
    }
  }

  return (
    <dialog
      className="drawer feedbackdialog"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="feedback-dialog"
    >
      <form
        className="drawer__panel"
        aria-busy={sending}
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void send()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">Feedback</p>
          <h2 className="drawer__title" id={headingId}>
            Report a bug or ask for a feature
          </h2>
        </header>

        <div className="drawer__body">
          {error ? (
            <p className="form__message" role="alert" data-testid="feedback-error">
              {error}
            </p>
          ) : null}

          <fieldset className="field" disabled={sending}>
            <legend className="field__label">What is it?</legend>
            <div className="segmented" role="group" aria-label="What is it?">
              <button
                className="segmented__option"
                type="button"
                aria-pressed={kind === FeedbackKind.Bug}
                onClick={() => setKind(FeedbackKind.Bug)}
                data-testid="feedback-kind-bug"
              >
                Bug
              </button>
              <button
                className="segmented__option"
                type="button"
                aria-pressed={kind === FeedbackKind.Feature}
                onClick={() => setKind(FeedbackKind.Feature)}
                data-testid="feedback-kind-feature"
              >
                Feature request
              </button>
            </div>
          </fieldset>

          <div className="field">
            <label className="field__label" htmlFor={textId}>
              {kind === FeedbackKind.Bug ? 'What went wrong?' : 'What would you like?'}
            </label>
            <textarea
              id={textId}
              className="field__input field__input--area"
              rows={6}
              maxLength={4000}
              value={text}
              disabled={sending}
              onChange={(event) => setText(event.target.value)}
              data-testid="feedback-text"
            />
            <p className="field__hint">
              {kind === FeedbackKind.Bug
                ? 'What you did, what you expected, and what happened instead.'
                : 'What it would let you do, and where you would use it.'}{' '}
              The page you are on is sent with it.
            </p>
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={sending} data-testid="feedback-send">
            {sending ? 'Sending' : 'Send'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            disabled={sending}
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}
