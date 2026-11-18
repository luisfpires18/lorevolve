import { useId } from 'react'
import { FieldInput } from '../FieldInputs'
import type { Chronology } from '../../chronology/types'
import { t, useI18n } from '../../i18n'
import { renderFact } from '../../lore/facts'
import type { FieldValue } from '../../lore/types'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import type { FieldDraft, Mode } from '../../progression/eraDraft'

/** Looked up when drawn, never frozen at import, so a change of language shows. */
function modeLabel(mode: Mode) {
  if (mode === 'inherit') return t('time.eraForm.mode.inherit')
  return mode === 'set' ? t('time.eraForm.mode.set') : t('time.eraForm.mode.cleared')
}

export function EraFieldRow({
  definition,
  field,
  inherited,
  universeId,
  entityId,
  chronology,
  error,
  onChange,
}: {
  definition: FieldDefinition
  field: FieldDraft
  inherited: FieldValue | null
  universeId: string
  entityId: string
  chronology: Chronology
  error?: string
  onChange: (change: Partial<FieldDraft>) => void
}) {
  useI18n()
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="erafield" data-testid={`era-field-${definition.name}`}>
      <div className="erafield__head">
        <label className="erafield__name" htmlFor={id}>
          {definition.name}
        </label>
        <select
          id={id}
          className="field__input field__input--select erafield__mode"
          value={field.mode}
          onChange={(event) => onChange({ mode: event.target.value as Mode })}
          aria-label={t('time.eraForm.fieldInStage', { name: definition.name })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          data-testid={`era-field-mode-${definition.name}`}
        >
          {(['inherit', 'set', 'cleared'] as Mode[])
            .filter((mode) => mode !== 'cleared' || !definition.isRequired)
            .map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
        </select>
      </div>

      {field.mode === 'inherit' ? (
        <p className="erafield__inherited">
          {inherited ? renderFact(inherited, chronology) : t('time.eraForm.notSetOnMain')}
        </p>
      ) : field.mode === 'set' ? (
        <FieldInput
          definition={definition}
          value={field.value}
          universeId={universeId}
          excludeId={entityId}
          heldReference={field.held}
          chronology={chronology}
          onChange={(value) => onChange({ value })}
        />
      ) : (
        <p className="erafield__inherited">{t('time.eraForm.leftEmpty')}</p>
      )}

      {error ? (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
