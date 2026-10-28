import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ImagePlus, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { ImageViewer } from './ImageViewer'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from '../lib/imageCrop'
import {
  addAppearanceImage,
  appearanceImageUrl,
  orderAppearanceImages,
  removeAppearanceImage,
} from '../progression/api'
import type { Appearance, AppearanceImage } from '../progression/types'
import { useUniverseAccess } from '../universes/access'

/**
 * An entry's appearances on the main profile (Issue #43): each look's label, notes, gallery and what it belongs to. Pictures are
 * added, ordered and removed here, one request each, and are not part of era history - a removed picture is deleted.
 */
export function AppearanceList({
  universeId,
  entityId,
  appearances,
  busy,
  onAdd,
  onEdit,
  onMove,
  onRemove,
  onPicturesChanged,
}: {
  universeId: string
  entityId: string
  appearances: Appearance[]
  busy: boolean
  onAdd: () => void
  onEdit: (appearance: Appearance) => void
  onMove: (appearance: Appearance, by: number) => void
  onRemove: (appearance: Appearance) => void
  /** A picture was added, moved or removed: the progression is read again. */
  onPicturesChanged: () => void
}) {
  const access = useUniverseAccess()

  if (appearances.length === 0 && !access.editContent) return null

  return (
    <section
      className="progitems"
      aria-labelledby="appearance-list-heading"
      data-testid="appearance-list"
    >
      <div className="progression__head">
        <h3 className="rail__heading" id="appearance-list-heading">
          Appearances
        </h3>
        {access.editContent ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={onAdd}
            disabled={busy}
            data-testid="add-appearance"
          >
            <ActionIcon icon={ImagePlus} />
            Add appearance
          </button>
        ) : null}
      </div>
      {appearances.length === 0 ? (
        <p className="muted">
          No appearances. An appearance is a look: an outfit, armour, a disguise, how a place
          looked.
        </p>
      ) : (
        <ul className="progitems__list">
          {appearances.map((appearance, index) => (
            <AppearanceItem
              key={appearance.id}
              canMoveEarlier={index > 0}
              canMoveLater={index < appearances.length - 1}
              onMove={(by) => onMove(appearance, by)}
              universeId={universeId}
              entityId={entityId}
              appearance={appearance}
              busy={busy}
              onEdit={() => onEdit(appearance)}
              onRemove={() => onRemove(appearance)}
              onPicturesChanged={onPicturesChanged}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function AppearanceItem({
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
  const access = useUniverseAccess()
  const inputId = useId()
  const [working, setWorking] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [viewing, setViewing] = useState<AppearanceImage | null>(null)
  const locked = busy || working !== null

  async function run(status: string, action: () => Promise<unknown>) {
    setMessage(null)
    setWorking(status)
    try {
      await action()
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : 'That change could not be saved.')
    } finally {
      setWorking(null)
      onPicturesChanged()
    }
  }

  async function add(files: FileList | null) {
    const chosen = [...(files ?? [])]
    if (chosen.length === 0 || locked) return
    const tooBig = chosen.find((file) => file.size > IMAGE_MAX_BYTES)
    if (tooBig) {
      setMessage(`Images must be ${IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.`)
      return
    }
    await run(
      chosen.length === 1 ? 'Adding the picture…' : `Adding ${chosen.length} pictures…`,
      async () => {
        for (const file of chosen)
          await addAppearanceImage(universeId, entityId, appearance.id, file)
      },
    )
  }

  async function move(image: AppearanceImage, by: number) {
    const ids = appearance.images.map((one) => one.id)
    const from = ids.indexOf(image.id)
    const to = from + by
    if (to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await run('Moving the picture…', () =>
      orderAppearanceImages(universeId, entityId, appearance.id, ids),
    )
  }

  async function remove(image: AppearanceImage, index: number) {
    if (
      !(await confirmAction({
        title: `Delete picture ${index + 1} of “${appearance.label}”?`,
        message: 'The picture is deleted for good. Stage history does not keep pictures.',
        confirmLabel: 'Delete picture',
        variant: 'destructive',
      }))
    ) {
      return
    }
    await run('Deleting the picture…', () =>
      removeAppearanceImage(universeId, entityId, appearance.id, image.id),
    )
  }

  const facts = [
    {
      term: 'Stages',
      value: appearance.eras.map((era) => era.name).join(', '),
      testId: 'appearance-eras',
    },
    {
      term: 'A look of',
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
            label={`Actions for ${appearance.label}`}
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
              Edit appearance
            </button>
            {canMoveEarlier ? (
              <button
                className="actionmenu__item"
                type="button"
                disabled={locked}
                onClick={() => onMove(-1)}
              >
                <ActionIcon icon={ArrowUp} />
                Move earlier
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
                Move later
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
              Remove appearance
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

      {appearance.images.length > 0 ? (
        <ol
          className="gallery"
          aria-label={`Pictures of ${appearance.label}`}
          data-testid="appearance-gallery"
        >
          {appearance.images.map((image, index) => {
            const name = `${appearance.label}, picture ${index + 1} of ${appearance.images.length}`
            return (
              <li className="gallery__item" key={image.id}>
                <button
                  className="gallery__open"
                  type="button"
                  onClick={() => setViewing(image)}
                  aria-label={`View ${name}`}
                >
                  <img
                    className="gallery__thumb"
                    src={appearanceImageUrl(
                      universeId,
                      entityId,
                      appearance.id,
                      image.id,
                      'original',
                    )}
                    alt=""
                    // The picture's own shape: the square thumbnail cut wide and tall pictures down to their middle.
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                  />
                </button>
                {access.editContent ? (
                  <ActionMenu
                    label={`Actions for ${name}`}
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
                        Move earlier
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
                        Move later
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
                      Delete picture
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
          <label className="button button--secondary button--sm imagefield__pick" htmlFor={inputId}>
            <ActionIcon icon={ImagePlus} />
            Add pictures
          </label>
          {working ? (
            <span className="muted" role="status">
              {working}
            </span>
          ) : null}
        </div>
      ) : null}

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
              <dt>Seen in</dt>
              <dd>
                <ul className="eracovers">
                  {appearance.scenes.map((scene) => (
                    <li key={scene.id}>
                      {scene.isTrashed ? (
                        <span>{scene.title} (in Trash)</span>
                      ) : (
                        <Link
                          to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                        >
                          {scene.title}
                        </Link>
                      )}
                      <span className="muted"> · {scene.storyTitle}</span>
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
