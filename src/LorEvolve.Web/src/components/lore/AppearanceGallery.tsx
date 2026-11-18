import { ArrowLeft, ArrowRight, ImagePlus, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { IMAGE_ACCEPT } from '../../lib/imageCrop'
import { appearanceDisplayUrl } from '../../progression/api'
import type { Appearance, AppearanceImage } from '../../progression/types'
import type { useUniverseAccess } from '../../universes/access'
import { t } from '../../i18n'
import type { useAppearanceImages } from '../../lore/useAppearanceImages'
import { buttonClass } from '../../lib/buttonClass'

type Pictures = ReturnType<typeof useAppearanceImages>

/** An appearance's pictures, each opened, moved or deleted, then Add pictures. */
export function AppearanceGallery({
  universeId,
  entityId,
  appearance,
  access,
  inputId,
  working,
  locked,
  add,
  move,
  remove,
  setViewing,
}: {
  universeId: string
  entityId: string
  appearance: Appearance
  access: ReturnType<typeof useUniverseAccess>
  inputId: string
  working: Pictures['working']
  locked: boolean
  add: Pictures['add']
  move: Pictures['move']
  remove: Pictures['remove']
  setViewing: (image: AppearanceImage) => void
}) {
  return (
    <>
      {appearance.images.length > 0 ? (
        <ol
          className="gallery"
          aria-label={t('progression.appearanceList.gallery', { name: appearance.label })}
          data-testid="appearance-gallery"
        >
          {appearance.images.map((image, index) => {
            const name = t('progression.appearanceList.pictureName', {
              name: appearance.label,
              index: index + 1,
              total: appearance.images.length,
            })
            return (
              <li className="gallery__item" key={image.id}>
                <button
                  className="gallery__open"
                  type="button"
                  onClick={() => setViewing(image)}
                  aria-label={t('progression.appearanceList.view', { name })}
                >
                  <img
                    className="gallery__thumb"
                    decoding="async"
                    src={appearanceDisplayUrl(universeId, entityId, appearance.id, image)}
                    alt=""
                    // The picture's own shape: the square thumbnail cut wide and tall pictures down to their middle.
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                  />
                </button>
                {access.editContent ? (
                  <ActionMenu
                    label={t('progression.appearanceList.pictureActions', { name })}
                    triggerTestId={`picture-actions-${index + 1}`}
                  >
                    {index > 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        disabled={locked}
                        onClick={() => void move(image, -1)}
                      >
                        <ActionIcon icon={ArrowLeft} />
                        {t('progression.appearanceList.moveEarlier')}
                      </button>
                    ) : null}
                    {index < appearance.images.length - 1 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        disabled={locked}
                        onClick={() => void move(image, 1)}
                      >
                        <ActionIcon icon={ArrowRight} />
                        {t('progression.appearanceList.moveLater')}
                      </button>
                    ) : null}
                    <button
                      className="actionmenu__item actionmenu__item--danger"
                      type="button"
                      disabled={locked}
                      onClick={() => void remove(image, index)}
                      data-testid="remove-picture"
                    >
                      <ActionIcon icon={Trash} />
                      {t('progression.appearanceList.deletePicture')}
                    </button>
                  </ActionMenu>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : null}

      {access.editContent ? (
        <div className="gallery__add">
          <input
            id={inputId}
            className="imagefield__input"
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            aria-disabled={locked || undefined}
            onChange={(event) => {
              const input = event.currentTarget
              void add(input.files).then(() => {
                input.value = ''
              })
            }}
            data-testid="appearance-picture-input"
          />
          <label
            className={buttonClass({
              tone: 'secondary',
              size: 'sm',
              className: 'imagefield__pick',
            })}
            htmlFor={inputId}
          >
            <ActionIcon icon={ImagePlus} />
            {t('progression.appearanceList.addPictures')}
          </label>
          {working ? (
            <span className="muted" role="status">
              {working}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
