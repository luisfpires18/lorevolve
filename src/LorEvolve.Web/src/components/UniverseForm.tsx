import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { UniverseInput } from '../universes/types'
import { confirmDiscard } from '../lib/confirm'
import { HEX, inputOf, normalizeHex } from '../universes/universeFormInput'
import { UniverseColourField } from './UniverseColourField'
import { Button } from './Button'

interface UniverseFormProps {
  initial?: UniverseInput
  /**
   * Which of the universe's own fields this form shows. Settings shows the name and description on General and the
   * colour on Appearance; the one it does not show is sent as it opened and replaced by the caller with what is stored.
   */
  fields?: 'all' | 'details' | 'colour'
  /** A new universe's form starts in its name. False when the page showed the form unasked, so it does not pull focus. */
  takesFocus?: boolean
  submitLabel: string
  busyLabel: string
  onSubmit: (input: UniverseInput) => Promise<unknown>
  onCancel?: () => void
  onDone?: () => void
}

export function UniverseForm({
  initial,
  fields = 'all',
  takesFocus = true,
  submitLabel,
  busyLabel,
  onSubmit,
  onCancel,
  onDone,
}: UniverseFormProps) {
  const { t } = useI18n()
  const colourId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [accentColor, setAccentColor] = useState(initial?.accentColor ?? '')
  const [colourText, setColourText] = useState(initial?.accentColor ?? '')
  const showDetails = fields !== 'colour'
  const [aiHelpChoice, setAiHelp] = useState(initial?.aiHelp ?? true)
  // Only the form that shows the choice sends it; the colour form leaves what is stored alone.
  const aiHelp = showDetails ? aiHelpChoice : undefined
  // A new universe starts empty: the author makes their own lore types unless they ask for the starter set.
  const [starterChoice, setStarterTypes] = useState(false)
  const starterTypes = initial ? undefined : starterChoice
  const showColour = fields !== 'details'
  const colourInvalid = colourText.trim() !== '' && !HEX.test(normalizeHex(colourText))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isSaved, setIsSaved] = useState(false)

  // Unsaved is the universe as it would be sent against the one the form opened on, so a change put back is none. Not
  // once it is sent: a new universe opens as it is created, and the page it leaves can stay on screen until the next
  // one has loaded. A save that fails asks again.
  const [opened] = useState(() =>
    payloadKey(inputOf(name, description, accentColor, aiHelp, starterTypes)),
  )
  const isDirty =
    !isSubmitting &&
    !isSaved &&
    payloadKey(inputOf(name, description, accentColor, aiHelp, starterTypes)) !== opened
  useLeaveGuard(
    isDirty
      ? initial
        ? t('universe.form.leaveEdited', { name: initial.name })
        : t('universe.form.leaveNew')
      : null,
  )

  async function cancel() {
    if (isDirty && !(await confirmDiscard())) return
    onCancel?.()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    if (showColour && colourInvalid) {
      setFieldErrors({ accentcolor: t('universe.form.colourInvalidSubmit') })
      return
    }
    setIsSubmitting(true)

    try {
      await onSubmit(inputOf(name, description, accentColor, aiHelp, starterTypes))
      setIsSaved(true)
      onDone?.()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) {
          setMessage(error.message)
        }
      } else {
        setMessage(t('universe.form.saveFailed'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {message ? (
        <p className="form__message" role="alert" data-testid="universe-error">
          {message}
        </p>
      ) : null}

      {showDetails ? (
        <>
          <Field
            label={t('universe.form.name')}
            name="name"
            // Opening a new universe starts at its name; Settings opens on the page, not in a field.
            autoFocus={!initial && takesFocus}
            required
            maxLength={120}
            dir="auto"
            value={name}
            error={fieldErrors.name}
            onChange={(event) => setName(event.target.value)}
          />

          <Field
            label={t('universe.form.description')}
            id="description"
            error={fieldErrors.description}
          >
            {(control) => (
              <textarea
                id={control.id}
                name="description"
                className="field__input field__input--area"
                rows={3}
                maxLength={2000}
                value={description}
                aria-describedby={control['aria-describedby']}
                aria-invalid={control['aria-invalid']}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </Field>

          <div className="field">
            <label className="check">
              <input
                type="checkbox"
                checked={aiHelpChoice}
                onChange={(event) => setAiHelp(event.target.checked)}
                data-testid="universe-ai-help"
              />
              {t('universe.form.aiHelp')}
            </label>
            <p className="field__hint">{t('universe.form.aiHelpHint')}</p>
          </div>

          {initial ? null : (
            <div className="field">
              <label className="check">
                <input
                  type="checkbox"
                  checked={starterChoice}
                  onChange={(event) => setStarterTypes(event.target.checked)}
                  data-testid="universe-starter-types"
                />
                {t('universe.form.starterTypes')}
              </label>
              <p className="field__hint">{t('universe.form.starterTypesHint')}</p>
            </div>
          )}
        </>
      ) : null}

      {showColour ? (
        <UniverseColourField
          colourId={colourId}
          fieldErrors={fieldErrors}
          colourInvalid={colourInvalid}
          accentColor={accentColor}
          setAccentColor={setAccentColor}
          colourText={colourText}
          setColourText={setColourText}
        />
      ) : null}

      <div className="form__actions">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? busyLabel : submitLabel}
        </Button>
        {onCancel ? (
          <Button tone="secondary" onClick={cancel}>
            {t('universe.form.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
