import { useId, type ReactNode } from 'react'
import { Field } from './Field'
import { fieldImageUrl, removeFieldImage, setFieldImage, setFieldImageCrop } from '../lore/images'
import type { EntityImageCrop, FieldImageRef } from '../lore/types'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FieldImageShape,
  aspectOfShape,
  type FieldImageShapeValue,
} from '../lore/fieldKinds'
import { ImageCropDialog } from './ImageCropDialog'
import { FieldImageRow } from './FieldImageRow'
import { pictureRatio } from '../lore/fieldImageFraming'
import { fieldImageActions } from '../lore/fieldImageActions'
import { useI18n } from '../i18n'
import { usePictureFraming } from '../lib/usePictureFraming'

/**
 * A picture chosen for an Image field of an entry that does not exist yet, with the frame the author chose.
 * `aspect` is the frame's width over its height, kept so the held picture previews at its own shape.
 */
export interface PendingFieldImage {
  file: File
  crop: EntityImageCrop
  aspect: number
}

/**
 * Where a picture other than an entry field's lives (#295: a comic page or panel). Without one the control talks to the
 * entry field routes, as before.
 */
export interface FieldImageApi<Ref = FieldImageRef> {
  url: (image: Ref, variant: 'original' | 'crop') => string
  set: (file: File, crop: EntityImageCrop) => Promise<Ref>
  setCrop: (assetId: string, crop: EntityImageCrop) => Promise<Ref>
  remove: () => Promise<void>
}

/**
 * The control for one Image field of an entry: pick a picture and crop it, recrop, replace, remove.
 *
 * It splits the way `EntityImageField` does. An entry that exists uploads on confirm, as its own request. A new entry
 * only holds the file and its crop, and the page uploads them once the create call has returned an id.
 *
 * The crop shape is the field's. A fixed shape opens the cropper at that ratio; Free opens it at the picked
 * picture's own ratio, so the author zooms and pans and the whole shape of the picture is the default.
 */
export function FieldImageInput({
  universeId,
  entityId,
  fieldId,
  name,
  shape,
  image,
  pending,
  onPending,
  onChanged,
  disabled,
  disabledHint,
  api: given,
  placeholder,
}: {
  universeId: string
  entityId: string | null
  fieldId: string
  name: string
  shape: FieldImageShapeValue | null
  image: FieldImageRef | null
  pending: PendingFieldImage | null
  onPending: (pending: PendingFieldImage | null) => void
  onChanged: (image: FieldImageRef | null) => void
  disabled: boolean
  /** Why the control is disabled, when the reason is worth saying. */
  disabledHint?: string
  /** Other routes for the picture; `entityId` is then only a "this exists" flag. */
  api?: FieldImageApi
  /** Shown when there is no picture, or the stored one fails to load. */
  placeholder?: ReactNode
}) {
  const { t } = useI18n()
  const inputId = useId()
  const { input, error, setError, busy, framing, setFraming, preview, choose, remove } =
    usePictureFraming<FieldImageRef, { aspect: number }>({
      tooBigKey: 'entity.image.tooBig',
      pending,
      onPending,
    })

  const api: FieldImageApi = given ?? {
    url: (stored, variant) => fieldImageUrl(universeId, entityId!, stored, variant),
    set: (file, crop) => setFieldImage(universeId, entityId!, fieldId, file, crop),
    setCrop: (assetId, crop) => setFieldImageCrop(universeId, entityId!, fieldId, assetId, crop),
    remove: () => removeFieldImage(universeId, entityId!, fieldId),
  }

  const frame = shape ?? FieldImageShape.Free
  const fixedAspect = aspectOfShape(frame)

  const hasPicture = Boolean(pending || image)
  const testId = (part: string) => `field-image-${fieldId}-${part}`

  const { reframe, keep } = fieldImageActions({
    entityId,
    image,
    pending,
    onPending,
    onChanged,
    setError,
    framing,
    setFraming,
    api,
    fixedAspect,
    preview,
  })

  const framed = (source: string) =>
    Promise.resolve(fixedAspect ?? pictureRatio(source)).then((aspect) => ({ aspect }))

  return (
    <>
      <Field
        label={name}
        id={inputId}
        className="stack stack--2"
        data-testid={`field-image-${fieldId}`}
        hint={
          <>
            {disabledHint ? (
              <span data-testid={testId('disabled-hint')}>{disabledHint}</span>
            ) : null}{' '}
            <span>{pending ? t('entity.image.hint.pending') : t('entity.image.hint.rules')}</span>
          </>
        }
        error={error ?? undefined}
        announce
        errorTestId={testId('error')}
      >
        {(control) => (
          <FieldImageRow
            control={control}
            inputId={inputId}
            entityId={entityId}
            name={name}
            image={image}
            pending={pending}
            placeholder={placeholder}
            input={input}
            busy={busy}
            disabled={disabled}
            api={api}
            preview={preview}
            hasPicture={hasPicture}
            testId={testId}
            choose={(file) => choose(file, framed)}
            reframe={reframe}
            remove={() =>
              remove({
                stored: Boolean(entityId && image),
                run: api.remove,
                done: () => onChanged(null),
                failed: () => t('entity.image.removeFailed'),
              })
            }
          />
        )}
      </Field>

      {framing ? (
        <ImageCropDialog
          // A new picture is a new cropper, never the last one's state carried over.
          key={framing.source}
          source={framing.source}
          aspect={framing.aspect}
          frameLabel={FIELD_IMAGE_SHAPE_LABELS[frame]}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : framing.initial}
          title={
            framing.kind === 'stored'
              ? t('entity.fieldImage.crop.editTitle')
              : t('entity.fieldImage.crop.frameTitle')
          }
          confirmLabel={
            framing.kind === 'stored'
              ? t('entity.fieldImage.crop.saveCrop')
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
