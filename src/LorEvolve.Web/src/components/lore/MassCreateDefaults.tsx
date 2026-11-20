import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { typeChoices } from '../../lore/typeTree'
import { hasRequiredFields } from '../../lore/massCreate'
import type { CanonStatusValue } from '../../lore/types'
import { CanonStatusPicker } from '../CanonStatusPicker'
import type { EntityType } from '../../lore/typeDefinitions'
import type { useMassRows } from '../../lore/useMassRows'
import { Button } from '../Button'

type Rows = ReturnType<typeof useMassRows>

/** The type and status new rows start with, and Apply to all rows. */
export function MassCreateDefaults({
  id,
  choices,
  eligible,
  startingType,
  startingBlocked,
  setChosenTypeId,
  defaultTypeId,
  defaultStatus,
  setDefaultStatus,
  rows,
  applyDefaults,
}: Pick<Rows, 'rows' | 'applyDefaults'> & {
  id: string
  choices: ReturnType<typeof typeChoices>
  eligible: EntityType[]
  startingType: EntityType | null
  startingBlocked: boolean
  setChosenTypeId: (typeId: string | null) => void
  defaultTypeId: string
  defaultStatus: CanonStatusValue
  setDefaultStatus: (status: CanonStatusValue) => void
}) {
  const { t, tx } = useI18n()
  return (
    <section className="masscreate__defaults" aria-label={t('lore.massCreate.defaults')}>
      <Field
        label={t('lore.massCreate.defaultType')}
        id={`${id}-default-type`}
        className="masscreate__default"
      >
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select"
            value={defaultTypeId}
            onChange={(event) => setChosenTypeId(event.target.value)}
            disabled={eligible.length === 0}
            data-testid="mass-default-type"
          >
            {choices.map(({ type, label }) => (
              <option key={type.id} value={type.id} disabled={hasRequiredFields(type)}>
                {hasRequiredFields(type) ? t('lore.massCreate.hasRequired', { label }) : label}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label={t('lore.massCreate.defaultStatus')}
        id={`${id}-default-status`}
        group
        className="masscreate__default"
      >
        {(control) => (
          <CanonStatusPicker
            {...control}
            testId="mass-default-status"
            value={defaultStatus}
            onChange={setDefaultStatus}
          />
        )}
      </Field>

      {rows.length > 0 ? (
        <Button
          tone="text"
          size="sm"
          className="masscreate__apply"
          onClick={applyDefaults}
          data-testid="mass-apply-defaults"
        >
          {t('lore.massCreate.applyAll')}
        </Button>
      ) : null}

      {startingBlocked && startingType ? (
        <p className="field__hint masscreate__note" data-testid="mass-starting-blocked">
          {tx('lore.massCreate.startingBlocked', { name: <bdi>{startingType.name}</bdi> })}
        </p>
      ) : null}
    </section>
  )
}
