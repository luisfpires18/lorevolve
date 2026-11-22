import { useId, useState, type FormEvent } from 'react'
import { useI18n } from '../i18n'
import { CheckField } from './CheckField'
import { Field } from './Field'
import { payloadKey } from '../lib/drawerGuard'
import { useDiscardGuard } from '../lib/useDiscardGuard'
import { useFormSave } from '../lib/useFormSave'
import type { UniverseInput } from '../universes/types'
import { HEX, inputOf, normalizeHex } from '../universes/universeFormInput'
import { UniverseColourField } from './UniverseColourField'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'

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
  const form = useFormSave({ needChange: null, failed: t('universe.form.saveFailed') })
  const { fieldErrors, setFieldErrors, setMessage, message, isSaving } = form

  const [isSaved, setIsSaved] = useState(false)

  // Unsaved is the universe as it would be sent against the one the form opened on, so a change put back is none. Not
  // once it is sent: a new universe opens as it is created, and the page it leaves can stay on screen until the next
  // one has loaded. A save that fails asks again.
  const [opened] = useState(() =>
    payloadKey(inputOf(name, description, accentColor, aiHelp, starterTypes)),
  )
  const isDirty =
    !isSaving &&
    !isSaved &&
    payloadKey(inputOf(name, description, accentColor, aiHelp, starterTypes)) !== opened
  const { confirmLeave } = useDiscardGuard(
    isDirty,
    initial ? t('universe.form.leaveEdited', { name: initial.name }) : t('universe.form.leaveNew'),
  )

  async function cancel() {
    if (!(await confirmLeave())) return
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
    await form.save(async () => {
      await onSubmit(inputOf(name, description, accentColor, aiHelp, starterTypes))
      setIsSaved(true)
      onDone?.()
    })
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {message ? <FormMessage testId="universe-error">{message}</FormMessage> : null}

      {showDetails ? (
        <>
          <Field
            label={t('universe.form.name')}
            name="name"
            // Opening a new universe starts at its name; Settings opens on the page, not in a field.
            autoFocus={!initial && takesFocus}
            required
            requiredMark
            maxLength={120}
            dir="auto"
            value={name}
            error={fieldErrors.name}
            onChange={(event) => setName(event.target.value)}
          />

          <Field
            as="textarea"
            label={t('universe.form.description')}
            id="description"
            error={fieldErrors.description}
            name="description"
            rows={3}
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <CheckField
            label={t('universe.form.aiHelp')}
            hint={t('universe.form.aiHelpHint')}
            checked={aiHelpChoice}
            onChange={setAiHelp}
            testId="universe-ai-help"
          />

          {initial ? null : (
            <CheckField
              label={t('universe.form.starterTypes')}
              hint={t('universe.form.starterTypesHint')}
              checked={starterChoice}
              onChange={setStarterTypes}
              testId="universe-starter-types"
            />
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

      <FormActions
        submitLabel={submitLabel}
        busy={isSaving}
        busyLabel={busyLabel}
        onCancel={onCancel ? cancel : undefined}
        inline
      />
    </form>
  )
}
