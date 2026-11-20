import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { FIELD_KIND_LABELS, type FieldKindValue } from '../../lore/fieldKinds'
import { KIND_ORDER } from '../../lore/fieldDraft'
import type { FieldDefinition } from '../../lore/typeDefinitions'

/** A field's name, its kind (frozen while values hold it), and the options of a select. */
export function FieldKindFields({
  field,
  latest,
  name,
  setName,
  kind,
  chooseKind,
  hasOptions,
  options,
  setOptions,
  fieldErrors,
  kinds = KIND_ORDER,
  lines = false,
}: {
  field: FieldDefinition | null
  latest: FieldDefinition | undefined
  name: string
  setName: (name: string) => void
  kind: FieldKindValue
  chooseKind: (next: FieldKindValue) => void
  hasOptions: boolean
  options: string
  setOptions: (options: string) => void
  fieldErrors: Record<string, string>
  /** The kinds offered, in order: every kind unless the place allows fewer (a project field has no link). */
  kinds?: FieldKindValue[]
  /** Options in a textarea, one per line (a project field), rather than one comma-separated line. */
  lines?: boolean
}) {
  const { t, tn } = useI18n()
  // The kind is frozen while any entry holds a value, or any older version recorded one (Issue #39).
  const held = field === null ? null : (latest ?? field)
  const kindLocked = held !== null && (held.entryCount > 0 || held.usedInHistory)
  return (
    <>
      <Field
        label={t('entityTypes.fields.fieldName')}
        name="field-name"
        dir="auto"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={fieldErrors.name}
        data-testid="field-name"
      />

      <Field
        as="select"
        label={t('entityTypes.fields.kind')}
        id="field-kind"
        hint={
          kindLocked ? (
            <span data-testid="field-kind-hint">
              {held.entryCount > 0
                ? tn('entityTypes.fields.kindLockedHeld', held.entryCount, { n: held.entryCount })
                : t('entityTypes.fields.kindLockedHistory')}
            </span>
          ) : undefined
        }
        value={kind}
        disabled={kindLocked}
        onChange={(event) => chooseKind(Number(event.target.value) as FieldKindValue)}
        data-testid="field-kind"
      >
        {kinds.map((each) => (
          <option key={each} value={each}>
            {FIELD_KIND_LABELS[each]}
          </option>
        ))}
      </Field>

      {hasOptions && lines ? (
        <Field
          as="textarea"
          label={t('projects.schema.fieldOptions')}
          name="field-options"
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          error={fieldErrors.options}
          data-testid="field-options"
        />
      ) : hasOptions ? (
        <Field
          label={t('entityTypes.fields.options')}
          name="field-options"
          value={options}
          onChange={(event) => setOptions(event.target.value)}
          error={fieldErrors.options}
          hint={field ? t('entityTypes.fields.optionsHint') : undefined}
          data-testid="field-options"
        />
      ) : null}
    </>
  )
}
