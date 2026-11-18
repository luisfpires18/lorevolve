import type { ReactNode, RefObject } from 'react'
import { ImageMinus, ImagePlus, ImageUp, Crop } from 'lucide-react'
import { IMAGE_ACCEPT } from '../lore/images'
import type { FieldImageRef } from '../lore/types'
import { showsArt } from '../projectEntities/structureTree'
import { ActionIcon } from './ActionIcon'
import { CroppedPicture } from './ImageCropDialog'
import type { FieldImageApi, PendingFieldImage } from './FieldImageInput'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { buttonClass } from '../lib/buttonClass'

/** The picture row of an Image field: the preview, the file input, the pick label and the actions. */
export function FieldImageRow({
  control,
  inputId,
  entityId,
  name,
  image,
  pending,
  placeholder,
  input,
  busy,
  brokenCrop,
  setBrokenCrop,
  api,
  preview,
  hasPicture,
  busyOrDisabled,
  testId,
  choose,
  reframe,
  remove,
}: {
  control: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true }
  inputId: string
  entityId: string | null
  name: string
  image: FieldImageRef | null
  pending: PendingFieldImage | null
  placeholder?: ReactNode
  input: RefObject<HTMLInputElement | null>
  busy: boolean
  brokenCrop: string | null
  setBrokenCrop: (cropId: string | null) => void
  api: FieldImageApi
  preview: string | null
  hasPicture: boolean
  busyOrDisabled: boolean
  testId: (part: string) => string
  choose: (file: File | undefined) => Promise<void>
  reframe: () => Promise<void>
  remove: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
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

        <label
          className={buttonClass({ tone: 'secondary', className: 'imagefield__pick' })}
          htmlFor={inputId}
        >
          <ActionIcon icon={hasPicture ? ImageUp : ImagePlus} />
          {hasPicture ? t('entity.image.replace') : t('entity.image.add')}
        </label>

        {hasPicture ? (
          <>
            <Button
              tone="secondary"
              icon={Crop}
              disabled={busyOrDisabled}
              onClick={() => void reframe()}
              data-testid={testId('reframe')}
            >
              {t('entity.fieldImage.reframe')}
            </Button>
            <Button
              tone="danger-quiet"
              icon={ImageMinus}
              disabled={busyOrDisabled}
              onClick={() => void remove()}
              data-testid={testId('remove')}
            >
              {busy ? t('entity.image.removing') : t('entity.image.remove')}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}
