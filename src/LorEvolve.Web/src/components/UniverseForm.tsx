import { useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import { ActionIcon } from './ActionIcon'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import type { UniverseInput } from '../universes/types'
import { confirmDiscard } from '../lib/confirm'

/**
 * A universe's colour is the author's own (UI refinement 014): any `#rrggbb` - the one shape the API accepts - or none.
 * No palette is offered. Colours chosen from the old palette are ordinary values and stay exactly as they were.
 */
const HEX = /^#[0-9a-fA-F]{6}$/

/** What the picker shows while there is no colour: a neutral it never saves on its own. */
const PICKER_IDLE = '#7a7468'

/** The text as typed, made into the stored shape where it plainly is one: trimmed, `#` added, lower case. */
function normalizeHex(text: string) {
  const value = text.trim()
  if (value === '') return ''
  const withHash = value.startsWith('#') ? value : `#${value}`
  return HEX.test(withHash) ? withHash.toLowerCase() : value
}

/** The universe as a save sends it. */
function inputOf(
  name: string,
  description: string,
  accentColor: string,
  aiHelp: boolean | undefined,
  starterTypes?: boolean,
): UniverseInput {
  return {
    name: name.trim(),
    description: description.trim() || null,
    accentColor: accentColor || null,
    aiHelp,
    ...(starterTypes === undefined ? {} : { starterTypes }),
  }
}

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

          <div className="field">
            <label className="field__label" htmlFor="description">
              {t('universe.form.description')}
            </label>
            <textarea
              id="description"
              name="description"
              className="field__input field__input--area"
              rows={3}
              maxLength={2000}
              value={description}
              aria-invalid={fieldErrors.description ? true : undefined}
              onChange={(event) => setDescription(event.target.value)}
            />
            {fieldErrors.description ? (
              <p className="field__error">{fieldErrors.description}</p>
            ) : null}
          </div>

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
        <div className="field colourfield">
          <label className="field__label" htmlFor={`${colourId}-hex`}>
            {t('universe.form.colour')}
          </label>
          <div className="colourfield__row">
            <input
              className="colourfield__picker"
              type="color"
              aria-label={t('universe.form.colourPick')}
              value={HEX.test(accentColor) ? accentColor : PICKER_IDLE}
              onChange={(event) => {
                setAccentColor(event.target.value)
                setColourText(event.target.value)
              }}
              data-testid="universe-colour-picker"
            />
            <input
              id={`${colourId}-hex`}
              className="field__input colourfield__hex"
              type="text"
              inputMode="text"
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              placeholder={t('universe.form.colourNone')}
              value={colourText}
              aria-invalid={colourInvalid || fieldErrors.accentcolor ? true : undefined}
              aria-describedby={`${colourId}-hint`}
              onChange={(event) => {
                setColourText(event.target.value)
                const next = normalizeHex(event.target.value)
                // The saved value follows the text only while the text is a colour, or empty for none.
                if (next === '' || HEX.test(next)) setAccentColor(next)
              }}
              onBlur={() => setColourText(normalizeHex(colourText))}
              data-testid="universe-colour-hex"
            />
            {accentColor ? (
              <button
                className="button button--text button--sm"
                type="button"
                onClick={() => {
                  setAccentColor('')
                  setColourText('')
                }}
                data-testid="universe-colour-clear"
              >
                <ActionIcon icon={X} />
                {t('universe.form.colourClear')}
              </button>
            ) : null}
          </div>
          <p className="field__hint" id={`${colourId}-hint`}>
            {accentColor ? t('universe.form.colourHintSet') : t('universe.form.colourHintUnset')}
          </p>
          {colourInvalid && !fieldErrors.accentcolor ? (
            <p className="field__error" role="alert">
              {t('universe.form.colourInvalid')}
            </p>
          ) : null}
          {fieldErrors.accentcolor ? (
            <p className="field__error" role="alert">
              {fieldErrors.accentcolor}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="form__actions">
        <button className="button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? busyLabel : submitLabel}
        </button>
        {onCancel ? (
          <button className="button button--secondary" type="button" onClick={cancel}>
            {t('universe.form.cancel')}
          </button>
        ) : null}
      </div>
    </form>
  )
}
