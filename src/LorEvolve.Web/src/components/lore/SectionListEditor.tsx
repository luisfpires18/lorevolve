import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { DraftSection } from '../../lore/sectionLayout'

/** The sections drawer's list of sections: name, fold, move and remove each one, and Add section. */
export function SectionListEditor({
  sections,
  errors,
  sectionLabel,
  patch,
  move,
  add,
  remove,
}: {
  sections: DraftSection[]
  errors: Record<string, string>
  sectionLabel: (section: DraftSection, index: number) => string
  patch: (key: string, part: Partial<DraftSection>) => void
  move: (index: number, step: number) => void
  add: () => void
  remove: (key: string) => void
}) {
  const { t } = useI18n()
  return (
    <section className="drawer__group" aria-labelledby="sections-list">
      <h3 className="sectionrule sectionrule--accent" id="sections-list">
        {t('entityTypes.sections.heading')}
      </h3>
      {sections.length === 0 ? (
        <p className="settings__note">{t('entityTypes.sections.empty')}</p>
      ) : (
        <ol className="sectionlist">
          {sections.map((section, index) => (
            <li className="sectionlist__row" key={section.key} data-testid={`section-row-${index}`}>
              <Field
                label={t('entityTypes.sections.sectionName')}
                name={`section-name-${section.key}`}
                dir="auto"
                value={section.name}
                onChange={(event) => patch(section.key, { name: event.target.value })}
                error={errors[section.key]}
                data-testid={`section-name-${index}`}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={section.startsCollapsed}
                  onChange={(event) =>
                    patch(section.key, { startsCollapsed: event.target.checked })
                  }
                  data-testid={`section-collapsed-${index}`}
                />
                <span>{t('entityTypes.sections.startsCollapsed')}</span>
              </label>
              <span className="sectionlist__actions">
                <button
                  className="iconbutton"
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('entityTypes.sections.moveSectionUp', {
                    name: sectionLabel(section, index),
                  })}
                  title={t('entityTypes.sections.moveUp')}
                  data-testid={`section-up-${index}`}
                >
                  <ArrowUp aria-hidden="true" focusable="false" strokeWidth={1.75} />
                </button>
                <button
                  className="iconbutton"
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === sections.length - 1}
                  aria-label={t('entityTypes.sections.moveSectionDown', {
                    name: sectionLabel(section, index),
                  })}
                  title={t('entityTypes.sections.moveDown')}
                  data-testid={`section-down-${index}`}
                >
                  <ArrowDown aria-hidden="true" focusable="false" strokeWidth={1.75} />
                </button>
                <button
                  className="button button--text button--sm fieldlist__delete"
                  type="button"
                  onClick={() => remove(section.key)}
                  aria-label={t('entityTypes.sections.removeSection', {
                    name: sectionLabel(section, index),
                  })}
                  data-testid={`section-remove-${index}`}
                >
                  <ActionIcon icon={Trash2} />
                  {t('entityTypes.sections.remove')}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <button
        className="button button--secondary button--sm sectionlist__add"
        type="button"
        onClick={add}
        data-testid="add-section"
      >
        <ActionIcon icon={Plus} />
        {t('entityTypes.sections.add')}
      </button>
    </section>
  )
}
