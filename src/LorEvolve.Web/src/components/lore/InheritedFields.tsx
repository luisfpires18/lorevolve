import { useI18n } from '../../i18n'
import type { EntityType, FieldDefinition } from '../../lore/typeDefinitions'
import { QuietNote } from '../QuietNote'

/** The fields a nested type inherits, under each type above it, read-only. */
export function InheritedFields({
  type,
  inherited,
  summary,
}: {
  type: Pick<EntityType, 'name'>
  inherited: { owner: Pick<EntityType, 'id' | 'name'>; fields: FieldDefinition[] }[]
  summary: (field: FieldDefinition) => string
}) {
  const { t, tx } = useI18n()
  return (
    <>
      {inherited.map(({ owner, fields }) => (
        <div
          className="fieldlist__inherited"
          key={owner.id}
          data-testid={`inherited-fields-${owner.name}`}
        >
          <QuietNote spacing="block">
            {tx('entityTypes.fields.inheritedNote', {
              owner: <bdi>{owner.name}</bdi>,
              type: type.name,
              again: <bdi>{owner.name}</bdi>,
            })}
          </QuietNote>
          <ul
            className="fieldlist"
            aria-label={t('entityTypes.fields.inheritedLabel', {
              type: type.name,
              owner: owner.name,
            })}
          >
            {fields.map((field) => (
              <li
                className="fieldlist__row"
                key={field.id}
                data-testid={`inherited-field-${field.name}`}
              >
                <div className="fieldlist__text">
                  <span className="fieldlist__name">
                    <bdi>{field.name}</bdi>
                  </span>
                  <span className="fieldlist__meta">{summary(field)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
