import { Link } from 'react-router-dom'
import { RowMenu } from '../RowMenu'
import { MoveItems } from '../MoveItems'
import { useI18n } from '../../i18n'
import type { Ability, Appearance, Form } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { unlockParts } from '../../progression/unlockParts'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

/** One form or ability on the main profile: its name, the actions menu, and what the author said of it. */
export function ItemRow({
  kind,
  item,
  index,
  items,
  appearances,
  universeId,
  busy,
  access,
  words,
  onEdit,
  onMove,
  onRemove,
}: {
  kind: 'form' | 'ability'
  item: Form | Ability
  index: number
  items: (Form | Ability)[]
  appearances: Appearance[]
  universeId: string
  busy: boolean
  access: ReturnType<typeof useUniverseAccess>
  words: { title: string; add: string; edit: string; remove: string; empty: string }
  onEdit: (item: Form | Ability) => void
  onMove: (item: Form | Ability, by: number) => void
  onRemove: (item: Form | Ability) => void
}) {
  const { t } = useI18n()
  const unlock = unlockParts(item.unlock)
  return (
    <li className="progitems__item" data-testid={`${kind}-${item.name}`}>
      <div className="progitems__head">
        <h4 className="progitems__name">
          <bdi>{item.name}</bdi>
        </h4>
        {access.editContent ? (
          <RowMenu
            label={t('progression.items.actions', { name: item.name })}
            triggerTestId={`${kind}-actions-${item.name}`}
            busy={busy}
            onEdit={() => onEdit(item)}
            editLabel={words.edit}
            editTestId={`edit-${kind}`}
            onRemove={() => onRemove(item)}
            removeLabel={words.remove}
            removeTestId={`remove-${kind}`}
          >
            <MoveItems
              first={index === 0}
              last={index === items.length - 1}
              busy={busy}
              wording="earlier-later"
              onMove={(step) => onMove(item, step)}
            />
          </RowMenu>
        ) : null}
      </div>
      {item.description ? <p className="progitems__description prose">{item.description}</p> : null}
      <FactList look="inline">
        {unlock.length > 0 ? (
          <Fact name={t('progression.items.firstUnlocked')} valueTestId={`${kind}-unlock`}>
            {unlock.join(', ')}
          </Fact>
        ) : null}
        <Fact name={t('progression.items.availableIn')} valueTestId={`${kind}-available`}>
          {item.eras.length === 0
            ? t('progression.items.noStage')
            : item.eras.map((era) => era.name).join(', ')}
        </Fact>
        {kind === 'form' &&
        appearances.some((look) => look.forms.some((form) => form.id === item.id)) ? (
          <Fact name={t('progression.items.looks')} valueTestId="form-looks">
            {appearances
              .filter((look) => look.forms.some((form) => form.id === item.id))
              .map((look) => look.label)
              .join(', ')}
          </Fact>
        ) : null}
        {'forms' in item && item.forms.length > 0 ? (
          <Fact name={t('progression.items.forms')} valueTestId="ability-forms-read">
            {item.forms.map((form) => form.name).join(', ')}
          </Fact>
        ) : null}
        {item.scenes.length > 0 ? (
          <Fact name={t('progression.items.usedIn')}>
            <ul className="eracovers">
              {item.scenes.map((scene) => (
                <li key={scene.id}>
                  {scene.isTrashed ? (
                    <span>{t('progression.era.inTrash', { title: scene.title })}</span>
                  ) : (
                    <Link
                      to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                    >
                      {scene.title}
                    </Link>
                  )}
                  <span> · {scene.storyTitle}</span>
                </li>
              ))}
            </ul>
          </Fact>
        ) : null}
      </FactList>
    </li>
  )
}
