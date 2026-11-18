import type { RefObject } from 'react'
import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import type { EraDraft } from '../../progression/eraDraft'

/** The era's name, and what happens to the entry then. */
export function EraNameFields({
  entityName,
  draft,
  edit,
  errorOf,
  nameInput,
}: {
  entityName: string
  draft: EraDraft
  edit: (change: Partial<EraDraft>) => void
  errorOf: (part: string) => string | undefined
  nameInput: RefObject<HTMLInputElement | null>
}) {
  useI18n()
  return (
    <>
      <Field id="era-name" label={t('time.eraForm.name')} error={errorOf('name')}>
        {(control) => (
          <input
            {...control}
            ref={nameInput}
            className="field__input"
            dir="auto"
            placeholder={t('time.eraForm.namePlaceholder')}
            value={draft.name}
            onChange={(event) => edit({ name: event.target.value })}
            data-testid="era-name-input"
          />
        )}
      </Field>

      <Field
        id="era-description"
        label={t('time.eraForm.happens')}
        hint={t('time.eraForm.happensHint', { name: entityName })}
        error={errorOf('description')}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={4}
            dir="auto"
            value={draft.description}
            onChange={(event) => edit({ description: event.target.value })}
            data-testid="era-description-input"
          />
        )}
      </Field>
    </>
  )
}
