import { Field } from '../Field'
import { CANON_LABELS, CANON_ORDER, type CanonStatusValue, CANON_KEYS } from '../../lore/types'
import { useI18n } from '../../i18n'

export function FamilyLinkStatus({
  canonStatus,
  setCanonStatus,
}: {
  canonStatus: CanonStatusValue
  setCanonStatus: (canonStatus: CanonStatusValue) => void
}) {
  const { t } = useI18n()

  return (
    <Field label={t('places.linkForm.status')} group>
      {(control) => (
        <div className="canon" {...control}>
          {CANON_ORDER.map((option) => (
            <button
              key={option}
              type="button"
              className="canon__step"
              aria-pressed={canonStatus === option}
              onClick={() => setCanonStatus(option)}
              data-testid={`family-link-canon-${CANON_KEYS[option]}`}
            >
              {CANON_LABELS[option]}
            </button>
          ))}
        </div>
      )}
    </Field>
  )
}
