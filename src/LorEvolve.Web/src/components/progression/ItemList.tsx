import { useI18n } from '../../i18n'
import type { Ability, Appearance, Form } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { ItemRow } from './ItemRow'
import { NewButton } from '../NewButton'

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
    <section className="progitems" aria-labelledby={headingId} data-testid={`${kind}-list`}>
      <div className="progression__head">
        <h3 className="rail__heading" id={headingId}>
          {words.title}
        </h3>
        {access.editContent ? (
          <NewButton
            tone="secondary"
            size="sm"
            onClick={onAdd}
            disabled={busy}
            data-testid={`add-${kind}`}
          >
            {words.add}
          </NewButton>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="muted">{words.empty}</p>
      ) : (
        <ul className="progitems__list">
          {items.map((item, index) => (
            <ItemRow
              key={item.id}
              kind={kind}
              item={item}
              index={index}
              items={items}
              appearances={appearances}
              universeId={universeId}
              busy={busy}
              access={access}
              words={words}
              onEdit={onEdit}
              onMove={onMove}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
