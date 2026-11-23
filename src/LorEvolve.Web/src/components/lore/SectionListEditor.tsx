import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { DraftSection } from '../../lore/sectionLayout'
import { Button } from '../Button'
import { CheckField } from '../CheckField'
import { MoveItems } from '../MoveItems'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { DrawerSection } from '../Section'

/**
 * An ordered list of rows to name, move and remove, and Add: the sections drawer's sections by default. `row` draws a
 * row's own fields instead of a section's name and fold, with `bare` the list and its Add sit inside the caller's own
 * field (a scene's beats), and `words` and `testIds` give that list its own words and ids.
 */
export function SectionListEditor<Item extends { key: string } = DraftSection>({
  sections,
  errors,
  sectionLabel,
  patch,
  move,
  add,
  remove,
  row,
  bare,
  words,
  testIds,
  listId,
}: {
  sections: readonly Item[]
  errors?: Record<string, string>
  sectionLabel: (section: Item, index: number) => string
  patch?: (key: string, part: Partial<DraftSection>) => void
  move: (index: number, step: -1 | 1) => void
  add: () => void
  remove: (key: string) => void
  row?: (section: Item, index: number) => ReactNode
  bare?: boolean
  words?: {
    add: string
    remove: string
    removeLabel: (section: Item, index: number) => string
    moveTitles?: { up: string; down: string }
  }
  testIds?: {
    row: (index: number) => string
    up: (index: number) => string
    down: (index: number) => string
    remove: (index: number) => string
    add: string
  }
  /** The list's id, for a caller that moves the focus into its rows. */
  listId?: string
}) {
  const { t } = useI18n()
  const ids = testIds ?? {
    row: (index: number) => `section-row-${index}`,
    up: (index: number) => `section-up-${index}`,
    down: (index: number) => `section-down-${index}`,
    remove: (index: number) => `section-remove-${index}`,
    add: 'add-section',
  }
  const said = words ?? {
    add: t('entityTypes.sections.add'),
    remove: t('entityTypes.sections.remove'),
    removeLabel: (section: Item, index: number) =>
      t('entityTypes.sections.removeSection', { name: sectionLabel(section, index) }),
  }

  // A section's name and fold, when the caller draws no row of its own.
  const sectionRow = (item: Item, index: number) => {
    const section = item as unknown as DraftSection
    return (
      <>
        <Field
          label={t('entityTypes.sections.sectionName')}
          name={`section-name-${section.key}`}
          dir="auto"
          value={section.name}
          onChange={(event) => patch?.(section.key, { name: event.target.value })}
          error={errors?.[section.key]}
          data-testid={`section-name-${index}`}
        />
        <CheckField
          className="field--flow"
          label={<span>{t('entityTypes.sections.startsCollapsed')}</span>}
          checked={section.startsCollapsed}
          onChange={(checked) => patch?.(section.key, { startsCollapsed: checked })}
          testId={`section-collapsed-${index}`}
        />
      </>
    )
  }

  const list =
    sections.length === 0 ? null : (
      <ol className="plainlist stack stack--4" id={listId}>
        {sections.map((section, index) => (
          <li className="sectionlist__row" key={section.key} data-testid={ids.row(index)}>
            {(row ?? sectionRow)(section, index)}
            <span className="actions actions--compact sectionlist__actions">
              <MoveItems
                look="icon"
                name={sectionLabel(section, index)}
                titles={said.moveTitles}
                first={index === 0}
                last={index === sections.length - 1}
                testIds={{ up: ids.up(index), down: ids.down(index) }}
                onMove={(step) => move(index, step)}
              />
              <Button
                tone="danger-quiet"
                size="sm"
                icon={Trash2}
                className="fieldlist__delete"
                onClick={() => remove(section.key)}
                aria-label={said.removeLabel(section, index)}
                data-testid={ids.remove(index)}
              >
                {said.remove}
              </Button>
            </span>
          </li>
        ))}
      </ol>
    )

  const addButton = (
    <NewButton tone="secondary" size="sm" onClick={add} data-testid={ids.add}>
      {said.add}
    </NewButton>
  )

  if (bare) {
    return (
      <>
        {list}
        <p className="types__blockedlinks">{addButton}</p>
      </>
    )
  }

  return (
    <DrawerSection title={t('entityTypes.sections.heading')} titleId="sections-list">
      {list ?? <QuietNote spacing="block">{t('entityTypes.sections.empty')}</QuietNote>}
      {addButton}
    </DrawerSection>
  )
}
