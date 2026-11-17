import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Field } from './Field'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  fieldImageUrl,
  removeFieldImage,
  setFieldImage,
  setFieldImageCrop,
} from '../lore/images'
import {
  FIELD_IMAGE_SHAPE_LABELS,
  FieldImageShape,
  aspectOfShape,
  type EntityImageCrop,
  type FieldImageRef,
  type FieldImageShapeValue,
} from '../lore/types'
import { showsArt } from '../projectEntities/structureTree'
import { ActionIcon } from './ActionIcon'
import { CroppedPicture, ImageCropDialog } from './ImageCropDialog'
import { useI18n } from '../i18n'

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
export interface FieldImageApi {
  url: (image: FieldImageRef, variant: 'original' | 'crop') => string
  set: (file: File, crop: EntityImageCrop) => Promise<FieldImageRef>
  setCrop: (assetId: string, crop: EntityImageCrop) => Promise<FieldImageRef>
  remove: () => Promise<void>
}

/** What the cropper is open on: a file just picked, or a stored picture reframed from its own original. */
type Framing =
  | {
      kind: 'file'
      file: File
      source: string
      ownsSource: boolean
      initial: EntityImageCrop | null
      aspect: number
    }
  | { kind: 'stored'; image: FieldImageRef; source: string; aspect: number }

/** The picture's own width over its height, as the browser draws it. */
function pictureRatio(source: string) {
  return new Promise<number>((resolve) => {
    const probe = new Image()
    probe.onload = () => resolve(probe.naturalWidth / probe.naturalHeight || 1)
    probe.onerror = () => resolve(1)
    probe.src = source
  })
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
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [framing, setFraming] = useState<Framing | null>(null)
  const [brokenCrop, setBrokenCrop] = useState<string | null>(null)

  const api: FieldImageApi = given ?? {
    url: (stored, variant) => fieldImageUrl(universeId, entityId!, stored, variant),
    set: (file, crop) => setFieldImage(universeId, entityId!, fieldId, file, crop),
    setCrop: (assetId, crop) => setFieldImageCrop(universeId, entityId!, fieldId, assetId, crop),
    remove: () => removeFieldImage(universeId, entityId!, fieldId),
  }

  const frame = shape ?? FieldImageShape.Free
  const fixedAspect = aspectOfShape(frame)

  // A held file is previewed from the browser's own copy, so nothing is uploaded to preview it.
  const pendingFile = pending?.file ?? null
  const preview = useMemo(
    () => (pendingFile ? URL.createObjectURL(pendingFile) : null),
    [pendingFile],
  )

  useEffect(() => {
    if (!preview) return

    return () => {
      URL.revokeObjectURL(preview)
    }
  }, [preview])

  // A file picked for cropping has a URL of its own, released when the cropper closes either way.
  useEffect(() => {
    if (framing?.kind !== 'file' || !framing.ownsSource) return

    const source = framing.source
    return () => {
      URL.revokeObjectURL(source)
    }
  }, [framing])

  const hasPicture = Boolean(pending || image)
  const busyOrDisabled = busy || disabled
  const testId = (part: string) => `field-image-${fieldId}-${part}`

  async function choose(file: File | undefined) {
    if (input.current) input.current.value = ''
    if (!file) return

    setError(null)

    if (file.size > IMAGE_MAX_BYTES) {
      setError(t('entity.image.tooBig', { mb: IMAGE_MAX_BYTES / (1024 * 1024) }))
      return
    }

    const source = URL.createObjectURL(file)
    const aspect = fixedAspect ?? (await pictureRatio(source))
    setFraming({ kind: 'file', file, source, ownsSource: true, initial: null, aspect })
  }

  async function reframe() {
    setError(null)

    if (pending && preview) {
      setFraming({
        kind: 'file',
        file: pending.file,
        source: preview,
        ownsSource: false,
        initial: pending.crop,
        aspect: fixedAspect ?? (await pictureRatio(preview)),
      })
      return
    }

    if (entityId && image) {
      setFraming({
        kind: 'stored',
        image,
        source: api.url(image, 'original'),
        aspect: fixedAspect ?? image.width / image.height,
      })
    }
  }

  async function keep(crop: EntityImageCrop) {
    if (!framing) return

    if (framing.kind === 'stored') {
      // Only the frame is sent. The original stays exactly where it is.
      onChanged(await api.setCrop(framing.image.assetId, crop))
    } else if (!entityId) {
      onPending({ file: framing.file, crop, aspect: framing.aspect })
    } else {
      onChanged(await api.set(framing.file, crop))
    }

    setFraming(null)
  }

  async function remove() {
    setError(null)

    if (pending) {
      onPending(null)
      return
    }

    if (!entityId || !image) return

    setBusy(true)
    try {
      await api.remove()
      onChanged(null)
    } catch {
      setError(t('entity.image.removeFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Field
        label={name}
        id={inputId}
        className="imagefield"
        data-testid={`field-image-${fieldId}`}
        hint={
          <>
            {disabledHint ? (
              <span data-testid={testId('disabled-hint')}>{disabledHint}</span>
            ) : null}{' '}
            <span>{pending ? t('entity.image.hint.pending') : t('entity.image.hint.rules')}</span>
          </>
        }
        error={
          error ? (
            <span role="alert" data-testid={testId('error')}>
              {error}
            </span>
          ) : undefined
        }
      >
        {(control) => (
          <div className="imagefield__row">
            {pending && preview ? (
              <CroppedPicture
                className="imagefield__preview imagefield__preview--field"
                style={{
                  aspectRatio: pending.aspect,
                  width: `${Math.min(12, 9 * pending.aspect)}rem`,
                }}
                source={preview}
                crop={pending.crop}
                testId={testId('preview')}
              />
            ) : image && entityId && showsArt(image, brokenCrop) ? (
              <img
                className="imagefield__preview imagefield__preview--field"
                src={api.url(image, 'crop')}
                alt={name}
                width={image.width}
                height={image.height}
                onError={() => setBrokenCrop(image.cropId)}
                data-testid={testId('preview')}
              />
            ) : (
              (placeholder ?? null)
            )}

            <div className="imagefield__actions">
              {/* The input comes first so the label can be styled from its state. */}
              <input
                ref={input}
                {...control}
                className="imagefield__input"
                type="file"
                accept={IMAGE_ACCEPT}
                disabled={busyOrDisabled}
                onChange={(event) => void choose(event.target.files?.[0])}
                data-testid={testId('input')}
              />

              <label className="button button--secondary imagefield__pick" htmlFor={inputId}>
                <ActionIcon icon={hasPicture ? ImageUp : ImagePlus} />
                {hasPicture ? t('entity.image.replace') : t('entity.image.add')}
              </label>

              {hasPicture ? (
                <>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={busyOrDisabled}
                    onClick={() => void reframe()}
                    data-testid={testId('reframe')}
                  >
                    <ActionIcon icon={Crop} />
                    {t('entity.fieldImage.reframe')}
                  </button>
                  <button
                    className="button button--secondary button--danger-quiet"
                    type="button"
                    disabled={busyOrDisabled}
                    onClick={() => void remove()}
                    data-testid={testId('remove')}
                  >
                    <ActionIcon icon={ImageMinus} />
                    {busy ? t('entity.image.removing') : t('entity.image.remove')}
                  </button>
                </>
              ) : null}
            </div>
          </div>
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
