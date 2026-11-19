import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { useI18n } from '../../i18n'
import type { Ability, Appearance, Form } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { unlockParts } from '../../progression/unlockParts'

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
          <ActionMenu
            label={t('progression.items.actions', { name: item.name })}
            triggerTestId={`${kind}-actions-${item.name}`}
          >
            <button
              className="actionmenu__item"
              type="button"
              disabled={busy}
              onClick={() => onEdit(item)}
              data-testid={`edit-${kind}`}
            >
              <ActionIcon icon={Pencil} />
              {words.edit}
            </button>
            {index > 0 ? (
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy}
                onClick={() => onMove(item, -1)}
              >
                <ActionIcon icon={ArrowUp} />
                {t('progression.items.moveEarlier')}
              </button>
            ) : null}
            {index < items.length - 1 ? (
              <button
                className="actionmenu__item"
                type="button"
                disabled={busy}
                onClick={() => onMove(item, 1)}
              >
                <ActionIcon icon={ArrowDown} />
                {t('progression.items.moveLater')}
              </button>
            ) : null}
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={busy}
              onClick={() => onRemove(item)}
              data-testid={`remove-${kind}`}
            >
              <ActionIcon icon={Trash} />
              {words.remove}
            </button>
          </ActionMenu>
        ) : null}
      </div>
      {item.description ? <p className="progitems__description prose">{item.description}</p> : null}
      <dl className="progitems__facts">
        {unlock.length > 0 ? (
          <div>
            <dt>{t('progression.items.firstUnlocked')}</dt>
            <dd data-testid={`${kind}-unlock`}>{unlock.join(', ')}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t('progression.items.availableIn')}</dt>
          <dd data-testid={`${kind}-available`}>
            {item.eras.length === 0
              ? t('progression.items.noStage')
              : item.eras.map((era) => era.name).join(', ')}
          </dd>
        </div>
        {kind === 'form' &&
        appearances.some((look) => look.forms.some((form) => form.id === item.id)) ? (
          <div>
            <dt>{t('progression.items.looks')}</dt>
            <dd data-testid="form-looks">
              {appearances
                .filter((look) => look.forms.some((form) => form.id === item.id))
                .map((look) => look.label)
                .join(', ')}
            </dd>
          </div>
        ) : null}
        {'forms' in item && item.forms.length > 0 ? (
          <div>
            <dt>{t('progression.items.forms')}</dt>
            <dd data-testid="ability-forms-read">
              {item.forms.map((form) => form.name).join(', ')}
            </dd>
          </div>
        ) : null}
        {item.scenes.length > 0 ? (
          <div>
            <dt>{t('progression.items.usedIn')}</dt>
            <dd>
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
            </dd>
          </div>
        ) : null}
      </dl>
    </li>
  )
}
