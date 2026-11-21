import { useId, useRef, useState } from 'react'
import { MessageSquareWarning } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useI18n } from '../i18n'
import { useFormSave } from '../lib/useFormSave'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { FeedbackKind, sendFeedback, type FeedbackKindValue } from '../feedback/api'
import { FormActions } from './FormActions'
import { SegmentedField } from './SegmentedField'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

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
  const [kind, setKind] = useState<FeedbackKindValue>(FeedbackKind.Bug)
  const [text, setText] = useState('')
  const {
    isSaving: sending,
    message: error,
    setMessage: setError,
    save,
  } = useFormSave({
    needChange: null,
    failed: t('data.feedback.sendFailed'),
    refusal: (failure) =>
      failure instanceof ApiError
        ? (Object.values(failure.fieldErrors)[0] ?? failure.message)
        : false,
  })

  const textArea = useRef<HTMLTextAreaElement>(null)

  async function send() {
    if (text.trim() === '') {
      setError(t('data.feedback.describe'))
      return
    }
    await save(async () => {
      await sendFeedback(kind, text.trim(), pathname)
      onSent()
    })
  }

  return (
    <Drawer
      initialFocus={textArea}
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
        <FormActions
          submitLabel={t('data.feedback.send')}
          busy={sending}
          busyLabel={t('data.feedback.sending')}
          submitTestId="feedback-send"
          onCancel={close}
          lockCancel
        />
      )}
    >
      {error ? <FormMessage testId="feedback-error">{error}</FormMessage> : null}

      <SegmentedField
        label={t('data.feedback.kindLabel')}
        disabled={sending}
        options={[
          {
            value: FeedbackKind.Bug,
            label: t('data.feedback.kindBug'),
            testId: 'feedback-kind-bug',
          },
          {
            value: FeedbackKind.Feature,
            label: t('data.feedback.kindFeature'),
            testId: 'feedback-kind-feature',
          },
        ]}
        value={kind}
        onChange={setKind}
      />

      <Field
        label={
          kind === FeedbackKind.Bug ? t('data.feedback.textBug') : t('data.feedback.textFeature')
        }
        id={textId}
      >
        {() => (
          <>
            <textarea
              ref={textArea}
              id={textId}
              className="field__input field__input--area"
              rows={6}
              maxLength={4000}
              value={text}
              disabled={sending}
              onChange={(event) => setText(event.target.value)}
              data-testid="feedback-text"
            />
            <QuietNote spacing="hint">
              {kind === FeedbackKind.Bug
                ? t('data.feedback.hintBug')
                : t('data.feedback.hintFeature')}
            </QuietNote>
          </>
        )}
      </Field>
    </Drawer>
  )
}
