import { ArrowDown, ArrowUp } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { DraftSection } from '../../lore/sectionLayout'
import type { FieldDefinition } from '../../lore/typeDefinitions'

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
                <span className="sectionlist__actions">
                  <button
                    className="iconbutton"
                    type="button"
                    onClick={() => shift(field.id, -1)}
                    disabled={index === 0}
                    aria-label={t('entityTypes.sections.moveFieldUp', { name: field.name })}
                    title={t('entityTypes.sections.moveFieldUpTitle')}
                    data-testid={`field-up-${field.name}`}
                  >
                    <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                  </button>
                  <button
                    className="iconbutton"
                    type="button"
                    onClick={() => shift(field.id, 1)}
                    disabled={index === group.fields.length - 1}
                    aria-label={t('entityTypes.sections.moveFieldDown', {
                      name: field.name,
                    })}
                    title={t('entityTypes.sections.moveFieldDownTitle')}
                    data-testid={`field-down-${field.name}`}
                  >
                    <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
