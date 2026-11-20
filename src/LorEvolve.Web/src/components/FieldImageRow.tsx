import type { ReactNode, RefObject } from 'react'
import type { FieldImageRef } from '../lore/types'
import { PictureWithFallback } from './PictureWithFallback'
import { PictureActions } from './PictureActions'
import { CroppedPicture } from './ImageCropDialog'
import type { FieldImageApi, PendingFieldImage } from './FieldImageInput'
import { useI18n } from '../i18n'

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
  api,
  preview,
  hasPicture,
  disabled,
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
  api: FieldImageApi
  preview: string | null
  hasPicture: boolean
  disabled: boolean
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
      ) : image && entityId ? (
        <PictureWithFallback
          className="imagefield__preview imagefield__preview--field"
          src={api.url(image, 'crop')}
          alt={name}
          width={image.width}
          height={image.height}
          fallback={placeholder ?? null}
          testId={testId('preview')}
        />
      ) : (
        (placeholder ?? null)
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
          onReframe={() => void reframe()}
          onRemove={() => void remove()}
          labels={{
            add: t('entity.image.add'),
            replace: t('entity.image.replace'),
            reframe: t('entity.fieldImage.reframe'),
            remove: t('entity.image.remove'),
            removing: t('entity.image.removing'),
          }}
          testIds={{
            input: testId('input'),
            reframe: testId('reframe'),
            remove: testId('remove'),
          }}
        />
      </div>
    </div>
  )
}
