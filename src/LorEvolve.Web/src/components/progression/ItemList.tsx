import { t as translate, useI18n } from '../../i18n'
import type { Ability, Appearance, Form } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { ItemRow, type ItemFact } from './ItemRow'
import { unlockParts } from '../../progression/unlockParts'
import { NewButton } from '../NewButton'
import { QuietNote } from '../QuietNote'
import { PanelHead } from '../PanelHead'

/** An entry's forms or abilities on the main profile: each as the author said it, nothing filled in. */
export function ItemList({
  kind,
  items,
  appearances,
  universeId,
  entryName,
  busy,
  onAdd,
  onEdit,
  onMove,
  onRemove,
}: {
  kind: 'form' | 'ability'
  items: (Form | Ability)[]
  /** The entry's appearances: a form's look is the ones that name it (Issue #43). */
  appearances: Appearance[]
  universeId: string
  entryName: string
  busy: boolean
  onAdd: () => void
  onEdit: (item: Form | Ability) => void
  onMove: (item: Form | Ability, by: number) => void
  onRemove: (item: Form | Ability) => void
}) {
  const { t } = useI18n()
  const access = useUniverseAccess()
  const words =
    kind === 'form'
      ? {
          title: t('progression.items.form.title'),
          add: t('progression.items.form.add'),
          edit: t('progression.items.form.edit'),
          remove: t('progression.items.form.remove'),
          empty: t('progression.items.form.empty', { name: entryName }),
        }
      : {
          title: t('progression.items.ability.title'),
          add: t('progression.items.ability.add'),
          edit: t('progression.items.ability.edit'),
          remove: t('progression.items.ability.remove'),
          empty: t('progression.items.ability.empty'),
        }
  const headingId = `${kind}-list-heading`

  if (items.length === 0 && !access.editContent) return null

  return (
    <section className="stack stack--3" aria-labelledby={headingId} data-testid={`${kind}-list`}>
      <PanelHead
        look="label"
        level={3}
        align="start"
        titleId={headingId}
        title={words.title}
        action={
          access.editContent ? (
            <NewButton
              tone="secondary"
              size="sm"
              onClick={onAdd}
              disabled={busy}
              data-testid={`add-${kind}`}
            >
              {words.add}
            </NewButton>
          ) : null
        }
      />
      {items.length === 0 ? (
        <QuietNote>{words.empty}</QuietNote>
      ) : (
        <ul className="plainlist stack">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              kind={kind}
              name={item.name}
              description={item.description}
              universeId={universeId}
              first={index === 0}
              last={index === items.length - 1}
              busy={busy}
              canEdit={access.editContent}
              words={{
                actions: t('progression.items.actions', { name: item.name }),
                edit: words.edit,
                remove: words.remove,
                scenes: t('progression.items.usedIn'),
                sceneInTrash: (title) => t('progression.era.inTrash', { title }),
              }}
              facts={itemFacts(kind, item, appearances)}
              scenes={item.scenes}
              onEdit={() => onEdit(item)}
              onMove={(by) => onMove(item, by)}
              onRemove={() => onRemove(item)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** A form's or ability's facts, in the order the profile lists them. */
function itemFacts(kind: 'form' | 'ability', item: Form | Ability, appearances: Appearance[]) {
  const unlock = unlockParts(item.unlock)
  const looks = appearances.filter((look) => look.forms.some((form) => form.id === item.id))
  const facts: ItemFact[] = []
  if (unlock.length > 0)
    facts.push({
      name: translate('progression.items.firstUnlocked'),
      value: unlock.join(', '),
      testId: `${kind}-unlock`,
    })
  facts.push({
    name: translate('progression.items.availableIn'),
    value:
      item.eras.length === 0
        ? translate('progression.items.noStage')
        : item.eras.map((era) => era.name).join(', '),
    testId: `${kind}-available`,
  })
  if (kind === 'form' && looks.length > 0)
    facts.push({
      name: translate('progression.items.looks'),
      value: looks.map((look) => look.label).join(', '),
      testId: 'form-looks',
    })
  if ('forms' in item && item.forms.length > 0)
    facts.push({
      name: translate('progression.items.forms'),
      value: item.forms.map((form) => form.name).join(', '),
      testId: 'ability-forms-read',
    })
  return facts
}
