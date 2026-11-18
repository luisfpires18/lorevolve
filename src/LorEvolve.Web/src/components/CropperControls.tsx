import type { ImageCrop } from '../lib/imageCrop'
import { Field } from './Field'
import { useI18n } from '../i18n'
import { MAX_ZOOM, MIN_ZOOM } from './cropMath'
import { CroppedPicture } from './ImageCropDialog'

export function CropperControls({
  zoomId,
  zoom,
  loading,
  loadFailed,
  saving,
  setZoom,
  source,
  crop,
  aspect,
  frameLabel,
}: {
  zoomId: string
  zoom: number
  loading: boolean
  loadFailed: boolean
  saving: boolean
  setZoom: (zoom: number) => void
  source: string
  crop: ImageCrop | null
  aspect: number
  frameLabel: string | undefined
}) {
  const { t } = useI18n()

  return (
    <>
      <Field label={t('account.crop.zoom')} id={zoomId} className="cropper__zoom">
        {(control) => (
          <input
            {...control}
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={loading || loadFailed || saving}
            onChange={(event) => setZoom(Number(event.target.value))}
            data-testid="image-crop-zoom"
          />
        )}
      </Field>

      <div className="cropper__previews" aria-hidden="true">
        {frameLabel ? (
          <>
            <CroppedPicture
              className="cropper__preview"
              style={{ width: `${Math.min(3.25 * aspect, 9)}rem` }}
              source={source}
              crop={crop}
              testId="image-crop-preview"
            />
            <span className="cropper__caption">{frameLabel}</span>
          </>
        ) : aspect === 1 ? (
          <>
            <CroppedPicture
              className="cropper__preview"
              source={source}
              crop={crop}
              testId="image-crop-preview"
            />
            <CroppedPicture
              className="cropper__preview cropper__preview--round"
              source={source}
              crop={crop}
            />
            <span className="cropper__caption">{t('account.crop.thumbnailPreview')}</span>
          </>
        ) : (
          <>
            <CroppedPicture
              className="cropper__preview cropper__preview--wide"
              source={source}
              crop={crop}
              testId="image-crop-preview"
            />
            <span className="cropper__caption">{t('account.crop.cardPreview')}</span>
          </>
        )}
      </div>
    </>
  )
}
