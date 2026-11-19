import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { ImageViewer } from '../ImageViewer'
import { appearanceImageUrl } from '../../progression/api'
import type { Appearance, AppearanceImage } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { t, useI18n } from '../../i18n'
import { useAppearanceImages } from '../../lore/useAppearanceImages'
import { AppearanceGallery } from './AppearanceGallery'

export function AppearanceItem({
  canMoveEarlier,
  canMoveLater,
  onMove,
  universeId,
  entityId,
  appearance,
  busy,
  onEdit,
  onRemove,
  onPicturesChanged,
}: {
  canMoveEarlier: boolean
  canMoveLater: boolean
  onMove: (by: number) => void
  universeId: string
  entityId: string
  appearance: Appearance
  busy: boolean
  onEdit: () => void
  onRemove: () => void
  onPicturesChanged: () => void
}) {
  useI18n()
  const access = useUniverseAccess()
  const inputId = useId()
  const { working, message, locked, add, move, remove } = useAppearanceImages({
    universeId,
    entityId,
    appearance,
    busy,
    onPicturesChanged,
  })
  const [viewing, setViewing] = useState<AppearanceImage | null>(null)

  const facts = [
    {
      term: t('progression.appearanceList.stages'),
      value: appearance.eras.map((era) => era.name).join(', '),
      testId: 'appearance-eras',
    },
    {
      term: t('progression.appearanceList.aLookOf'),
      value: appearance.forms.map((form) => form.name).join(', '),
      testId: 'appearance-forms',
    },
  ].filter((fact) => fact.value !== '')

  return (
    <li className="progitems__item" data-testid={`appearance-${appearance.label}`}>
      <div className="progitems__head">
        <h4 className="progitems__name">
          <bdi>{appearance.label}</bdi>
        </h4>
        {access.editContent ? (
          <ActionMenu
            label={t('progression.appearanceList.actions', { name: appearance.label })}
            triggerTestId={`appearance-actions-${appearance.label}`}
          >
            <button
              className="actionmenu__item"
              type="button"
              disabled={locked}
              onClick={onEdit}
              data-testid="edit-appearance"
            >
              <ActionIcon icon={Pencil} />
              {t('progression.appearanceList.edit')}
            </button>
            {canMoveEarlier ? (
              <button
                className="actionmenu__item"
                type="button"
                disabled={locked}
                onClick={() => onMove(-1)}
              >
                <ActionIcon icon={ArrowUp} />
                {t('progression.appearanceList.moveEarlier')}
              </button>
            ) : null}
            {canMoveLater ? (
              <button
                className="actionmenu__item"
                type="button"
                disabled={locked}
                onClick={() => onMove(1)}
              >
                <ActionIcon icon={ArrowDown} />
                {t('progression.appearanceList.moveLater')}
              </button>
            ) : null}
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={locked}
              onClick={onRemove}
              data-testid="remove-appearance"
            >
              <ActionIcon icon={Trash} />
              {t('progression.appearanceList.remove')}
            </button>
          </ActionMenu>
        ) : null}
      </div>
      {appearance.notes ? <p className="progitems__description prose">{appearance.notes}</p> : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="appearance-message">
          {message}
        </p>
      ) : null}

      <AppearanceGallery
        universeId={universeId}
        entityId={entityId}
        appearance={appearance}
        access={access}
        inputId={inputId}
        working={working}
        locked={locked}
        add={add}
        move={move}
        remove={remove}
        setViewing={setViewing}
      />

      {facts.length > 0 || appearance.scenes.length > 0 ? (
        <dl className="progitems__facts">
          {facts.map((fact) => (
            <div key={fact.term}>
              <dt>{fact.term}</dt>
              <dd data-testid={fact.testId}>{fact.value}</dd>
            </div>
          ))}
          {appearance.scenes.length > 0 ? (
            <div>
              <dt>{t('progression.appearanceList.seenIn')}</dt>
              <dd>
                <ul className="eracovers">
                  {appearance.scenes.map((scene) => (
                    <li key={scene.id}>
                      {scene.isTrashed ? (
                        <span>
                          {t('progression.appearanceList.sceneInTrash', { title: scene.title })}
                        </span>
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
      ) : null}

      {viewing ? (
        <ImageViewer
          src={appearanceImageUrl(universeId, entityId, appearance.id, viewing.id, 'original')}
          name={appearance.label}
          width={viewing.width}
          height={viewing.height}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </li>
  )
}
