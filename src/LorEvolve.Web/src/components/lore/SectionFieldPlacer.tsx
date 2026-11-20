import { useI18n } from '../../i18n'
import type { DraftSection } from '../../lore/sectionLayout'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { MoveItems } from '../MoveItems'

/** The sections drawer's fields, under the group each is in: its section and its place in that group. */
export function SectionFieldPlacer({
  groups,
  sections,
  placed,
  sectionLabel,
  place,
  shift,
}: {
  groups: { key: string; label: string; fields: FieldDefinition[] }[]
  sections: DraftSection[]
  placed: Record<string, string>
  sectionLabel: (section: DraftSection, index: number) => string
  place: (fieldId: string, key: string) => void
  shift: (fieldId: string, step: number) => void
}) {
  const { t } = useI18n()
  return (
    <section className="drawer__group" aria-labelledby="sections-fields">
      <h3 className="sectionrule sectionrule--accent" id="sections-fields">
        {t('entityTypes.sections.fields')}
      </h3>
      {groups.map((group) => (
        <div className="sectionfields__group" key={group.key || 'none'}>
          <p className="sectionfields__label">
            <bdi>{group.label}</bdi>
          </p>
          <ol
            className="sectionfields"
            aria-label={t('entityTypes.sections.fieldsIn', { name: group.label })}
            data-testid={`fields-in-${group.label}`}
          >
            {group.fields.map((field, index) => (
              <li className="sectionfields__row" key={field.id}>
                <label className="sectionfields__name" htmlFor={`field-section-${field.id}`}>
                  <bdi>{field.name}</bdi>
                </label>
                <select
                  id={`field-section-${field.id}`}
                  className="field__input field__input--select"
                  value={placed[field.id] ?? ''}
                  onChange={(event) => place(field.id, event.target.value)}
                  data-testid={`place-${field.name}`}
                >
                  <option value="">{t('entityTypes.sections.noSectionOption')}</option>
                  {sections.map((section, at) => (
                    <option key={section.key} value={section.key}>
                      {sectionLabel(section, at)}
                    </option>
                  ))}
                </select>
                <span className="actions actions--compact sectionlist__actions">
                  <MoveItems
                    look="icon"
                    name={field.name}
                    first={index === 0}
                    last={index === group.fields.length - 1}
                    testIds={{ up: `field-up-${field.name}`, down: `field-down-${field.name}` }}
                    onMove={(step) => shift(field.id, step)}
                  />
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
