import { useEffect, useId, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { useReturnFocus } from '../lib/returnFocus'
import { FeedbackKind, sendFeedback, type FeedbackKindValue } from '../feedback/api'
import { Button } from './Button'

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
  const headingId = useId()
  const textId = useId()
  const { pathname } = useLocation()
  useReturnFocus()
  const [kind, setKind] = useState<FeedbackKindValue>(FeedbackKind.Bug)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
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
    <Drawer
      testId="feedback-dialog"
      titleId={headingId}
      className="feedbackdialog"
      eyebrow={t('data.feedback.open')}
      title={t('data.feedback.title')}
      isDirty={text.trim() !== '' && !sending}
      leaveMessage={t('data.feedback.leaveConfirm')}
      onClose={onClose}
      onSubmit={() => void send()}
      busy={sending}
      actions={(close) => (
        <>
          <Button type="submit" disabled={sending} data-testid="feedback-send">
            {sending ? t('data.feedback.sending') : t('data.feedback.send')}
          </Button>
          <Button tone="secondary" onClick={close} disabled={sending}>
            {t('data.feedback.cancel')}
          </Button>
        </>
      )}
    >
      {error ? (
        <p className="form__message" role="alert" data-testid="feedback-error">
          {error}
        </p>
      ) : null}

      <Field label={t('data.feedback.kindLabel')} group="fieldset" disabled={sending}>
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
      </Field>

      <Field
        label={
          kind === FeedbackKind.Bug ? t('data.feedback.textBug') : t('data.feedback.textFeature')
        }
        id={textId}
      >
        {() => (
          <>
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
          </>
        )}
      </Field>
    </Drawer>
  )
}
