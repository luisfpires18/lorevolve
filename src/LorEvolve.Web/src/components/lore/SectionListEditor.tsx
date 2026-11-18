import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { DraftSection } from '../../lore/sectionLayout'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { NewButton } from '../NewButton'

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
                <IconButton
                  icon={ArrowUp}
                  label={t('entityTypes.sections.moveSectionUp', {
                    name: sectionLabel(section, index),
                  })}
                  title={t('entityTypes.sections.moveUp')}
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  data-testid={`section-up-${index}`}
                />
                <IconButton
                  icon={ArrowDown}
                  label={t('entityTypes.sections.moveSectionDown', {
                    name: sectionLabel(section, index),
                  })}
                  title={t('entityTypes.sections.moveDown')}
                  onClick={() => move(index, 1)}
                  disabled={index === sections.length - 1}
                  data-testid={`section-down-${index}`}
                />
                <Button
                  tone="danger-quiet"
                  size="sm"
                  icon={Trash2}
                  className="fieldlist__delete"
                  onClick={() => remove(section.key)}
                  aria-label={t('entityTypes.sections.removeSection', {
                    name: sectionLabel(section, index),
                  })}
                  data-testid={`section-remove-${index}`}
                >
                  {t('entityTypes.sections.remove')}
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <NewButton tone="secondary" size="sm" onClick={add} data-testid="add-section">
        {t('entityTypes.sections.add')}
      </NewButton>
    </section>
  )
}
