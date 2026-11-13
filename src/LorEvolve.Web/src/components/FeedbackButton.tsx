import { useEffect, useId, useRef, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useI18n } from '../i18n'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { FeedbackKind, sendFeedback, type FeedbackKindValue } from '../feedback/api'

/**
 * Report a bug or ask for a feature, from any signed-in page: a small button at the window's corner opens a dialog, and what
 * is sent goes to the Admin with the path of the page it was sent from - nothing typed into that page, and no query.
 */
export function FeedbackButton() {
  const { t } = useI18n()
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
        <span>{t('data.feedback.open')}</span>
      </button>
      {thanked ? (
        <p className="feedbackbutton__thanks" role="status" data-testid="feedback-sent">
          {t('data.feedback.thanks')}
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
  const { t } = useI18n()
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
    t('data.feedback.leaveConfirm'),
    onClose,
  )

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById(textId)?.focus()
  }, [textId])

  async function send() {
    if (text.trim() === '') {
      setError(t('data.feedback.describe'))
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
          : t('data.feedback.sendFailed'),
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
          <p className="drawer__eyebrow">{t('data.feedback.open')}</p>
          <h2 className="drawer__title" id={headingId}>
            {t('data.feedback.title')}
          </h2>
        </header>

        <div className="drawer__body">
          {error ? (
            <p className="form__message" role="alert" data-testid="feedback-error">
              {error}
            </p>
          ) : null}

          <fieldset className="field" disabled={sending}>
            <legend className="field__label">{t('data.feedback.kindLabel')}</legend>
            <div className="segmented" role="group" aria-label={t('data.feedback.kindGroup')}>
              <button
                className="segmented__option"
                type="button"
                aria-pressed={kind === FeedbackKind.Bug}
                onClick={() => setKind(FeedbackKind.Bug)}
                data-testid="feedback-kind-bug"
              >
                {t('data.feedback.kindBug')}
              </button>
              <button
                className="segmented__option"
                type="button"
                aria-pressed={kind === FeedbackKind.Feature}
                onClick={() => setKind(FeedbackKind.Feature)}
                data-testid="feedback-kind-feature"
              >
                {t('data.feedback.kindFeature')}
              </button>
            </div>
          </fieldset>

          <div className="field">
            <label className="field__label" htmlFor={textId}>
              {kind === FeedbackKind.Bug
                ? t('data.feedback.textBug')
                : t('data.feedback.textFeature')}
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
                ? t('data.feedback.hintBug')
                : t('data.feedback.hintFeature')}
            </p>
          </div>
        </div>

        <footer className="drawer__actions">
          <button className="button" type="submit" disabled={sending} data-testid="feedback-send">
            {sending ? t('data.feedback.sending') : t('data.feedback.send')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            disabled={sending}
          >
            {t('data.feedback.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
