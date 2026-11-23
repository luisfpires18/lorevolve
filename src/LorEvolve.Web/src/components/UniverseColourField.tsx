import { X } from 'lucide-react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { HEX, PICKER_IDLE, normalizeHex } from '../universes/universeFormInput'
import { Button } from './Button'
import { QuietNote } from './QuietNote'

export function UniverseColourField({
  colourId,
  fieldErrors,
  colourInvalid,
  accentColor,
  setAccentColor,
  colourText,
  setColourText,
}: {
  colourId: string
  fieldErrors: Record<string, string>
  colourInvalid: boolean
  accentColor: string
  setAccentColor: (value: string) => void
  colourText: string
  setColourText: (value: string) => void
}) {
  const { t } = useI18n()
  return (
    <Field
      label={t('universe.form.colour')}
      id={`${colourId}-hex`}
      className="colourfield"
      error={
        fieldErrors.accentcolor || (colourInvalid ? t('universe.form.colourInvalid') : undefined)
      }
      announce
    >
      {(control) => (
        <>
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
              id={control.id}
              className="field__input colourfield__hex"
              type="text"
              inputMode="text"
              spellCheck={false}
              autoComplete="off"
              maxLength={7}
              value={colourText}
              aria-invalid={control['aria-invalid']}
              aria-describedby={`${colourId}-hint ${control['aria-describedby'] ?? ''}`.trim()}
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
              <Button
                tone="text"
                size="sm"
                icon={X}
                onClick={() => {
                  setAccentColor('')
                  setColourText('')
                }}
                data-testid="universe-colour-clear"
              >
                {t('universe.form.colourClear')}
              </Button>
            ) : null}
          </div>
          <QuietNote spacing="hint" id={`${colourId}-hint`}>
            {accentColor ? t('universe.form.colourHintSet') : t('universe.form.colourHintUnset')}
          </QuietNote>
        </>
      )}
    </Field>
  )
}
