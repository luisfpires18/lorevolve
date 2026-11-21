import { useId } from 'react'
import { EMPTY_FACT } from '../lore/facts'
import {
  entityImageUrl,
  removeEntityImage,
  setEntityImage,
  setEntityThumbnail,
} from '../lore/images'
import type { EntityImageCrop, EntityImageRef } from '../lore/types'
import { Field } from './Field'
import { CroppedPicture, ImageCropDialog } from './ImageCropDialog'
import { PictureActions } from './PictureActions'
import { useI18n } from '../i18n'
import { usePictureFraming } from '../lib/usePictureFraming'

/** A picture chosen for an entry that does not exist yet, with the square the author framed. */
export interface PendingImage {
  file: File
  crop: EntityImageCrop
}

/**
 * The editor's image control: pick one and frame it, reframe it, replace it, take it away.
 *
 * Every picture goes through the cropper before it goes anywhere. The whole picture is always
 * kept and shown on the entry's page; the square the author chooses is only what cards show.
 *
 * It behaves differently either side of the entry existing, because the object keys are built
 * from the entry's id and there is no id until the entry is saved.
 *
 * - An entry that exists uploads on confirm. The write is its own request, so the picture is
 *   stored whether or not the author goes on to save the rest of the form - and nothing is
 *   uploaded before the framing is confirmed, so a cancelled crop costs nothing.
 * - A new entry only *holds* the file and its framing, and previews them from a local object URL.
 *   `EntityPage` uploads both once the create call has come back with an id. Nothing is written to
 *   the bucket before there is an entry for it to belong to, so an abandoned form leaves nothing.
 */
export function EntityImageField({
  universeId,
  entityId,
  image,
  pending,
  onPending,
  onChanged,
  disabled,
}: {
  universeId: string
  entityId: string | null
  image: EntityImageRef | null
  pending: PendingImage | null
  onPending: (pending: PendingImage | null) => void
  onChanged: (image: EntityImageRef | null) => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const inputId = useId()
  const { input, error, setError, busy, framing, setFraming, preview, choose, remove } =
    usePictureFraming<EntityImageRef>({
      tooBigKey: 'entity.image.tooBig',
      pending,
      onPending,
    })

  const hasPicture = Boolean(pending || image)

  function reframe() {
    setError(null)

    if (pending && preview) {
      setFraming({
        kind: 'file',
        file: pending.file,
        source: preview,
        ownsSource: false,
        initial: pending.crop,
      })
      return
    }

    if (entityId && image) {
      setFraming({
        kind: 'stored',
        image,
        source: entityImageUrl(universeId, entityId, image, 'original'),
      })
    }
  }

  async function keep(crop: EntityImageCrop) {
    if (!framing) return

    if (framing.kind === 'stored') {
      // Only the square is sent. The original stays exactly where it is.
      onChanged(await setEntityThumbnail(universeId, entityId!, framing.image.assetId, crop))
    } else if (!entityId) {
      onPending({ file: framing.file, crop })
    } else {
      onChanged(await setEntityImage(universeId, entityId, framing.file, crop))
    }

    setFraming(null)
  }

  return (
    <>
      <Field
        label={t('entity.image.heading')}
        id={inputId}
        className="stack stack--2"
        data-testid="entity-image-field"
        hint={pending ? t('entity.image.hint.pending') : t('entity.image.hint.rules')}
        error={error ?? undefined}
        announce
        errorTestId="entity-image-error"
      >
        {(control) => (
          <div className="imagefield__row">
            {pending && preview ? (
              <CroppedPicture
                className="imagefield__preview"
                source={preview}
                crop={pending.crop}
                testId="entity-image-preview"
              />
            ) : image && entityId ? (
              <img
                className="imagefield__preview"
                src={entityImageUrl(universeId, entityId, image, 'thumbnail')}
                alt=""
                data-testid="entity-image-preview"
              />
            ) : (
              <span className="imagefield__preview imagefield__preview--blank" aria-hidden="true">
                {EMPTY_FACT}
              </span>
            )}

            <div className="imagefield__actions">
              <PictureActions
                input={input}
                control={control}
                inputId={inputId}
                hasPicture={hasPicture}
                busy={busy}
                disabled={disabled}
                onFile={(file) => void choose(file)}
                onReframe={reframe}
                onRemove={() =>
                  void remove({
                    stored: Boolean(entityId && image),
                    run: () => removeEntityImage(universeId, entityId!),
                    done: () => onChanged(null),
                    failed: () => t('entity.image.removeFailed'),
                  })
                }
                labels={{
                  add: t('entity.image.add'),
                  replace: t('entity.image.replace'),
                  reframe: t('entity.image.editThumbnail'),
                  remove: t('entity.image.remove'),
                  removing: t('entity.image.removing'),
                }}
                testIds={{
                  input: 'entity-image-input',
                  reframe: 'entity-image-reframe',
                  remove: 'entity-image-remove',
                }}
              />
            </div>
          </div>
        )}
      </Field>

      {framing ? (
        <ImageCropDialog
          // A new picture is a new cropper, never the last one's state carried over.
          key={framing.source}
          source={framing.source}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : framing.initial}
          title={
            framing.kind === 'stored'
              ? t('entity.image.crop.editTitle')
              : t('entity.image.crop.frameTitle')
          }
          confirmLabel={
            framing.kind === 'stored'
              ? t('entity.image.crop.saveThumbnail')
              : entityId
                ? t('entity.image.crop.upload')
                : t('entity.image.crop.usePicture')
          }
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </>
  )
}
