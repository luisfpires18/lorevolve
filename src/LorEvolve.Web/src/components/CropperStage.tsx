import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { useI18n } from '../i18n'
import { KEYBOARD_STEP, MAX_ZOOM, MIN_ZOOM } from './cropMath'

export function CropperStage({
  source,
  aspect,
  frameLabel,
  hintId,
  position,
  zoom,
  startingArea,
  loadFailed,
  loading,
  saving,
  setPosition,
  setZoom,
  setPixels,
  setNatural,
  setLoadFailed,
}: {
  source: string
  aspect: number
  frameLabel: string | undefined
  hintId: string
  position: { x: number; y: number }
  zoom: number
  startingArea: Area | undefined
  loadFailed: boolean
  loading: boolean
  saving: boolean
  setPosition: (position: { x: number; y: number }) => void
  setZoom: (zoom: number) => void
  setPixels: (area: Area | null) => void
  setNatural: (size: { width: number; height: number } | null) => void
  setLoadFailed: (failed: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <>
      {/* Inert, not merely unstyled, once a save starts: the crop that was submitted must not be
            able to change underneath it, by drag, by wheel or by arrow key. `pointer-events` alone
            would leave the square focusable and the keyboard still moving it. */}
      <div className="cropper__stage" data-testid="image-crop-stage" inert={saving || undefined}>
        {loadFailed ? (
          <p className="cropper__status" role="alert">
            {t('account.crop.loadFailed')}
          </p>
        ) : (
          <Cropper
            image={source}
            crop={position}
            zoom={zoom}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            aspect={aspect}
            keyboardStep={KEYBOARD_STEP}
            showGrid={false}
            restrictPosition
            disableAutomaticStylesInjection
            onCropChange={setPosition}
            onZoomChange={setZoom}
            onCropAreaChange={(_, areaPixels) => setPixels(areaPixels)}
            onMediaLoaded={(size) =>
              setNatural({ width: size.naturalWidth, height: size.naturalHeight })
            }
            initialCroppedAreaPercentages={startingArea}
            mediaProps={{ alt: '', onError: () => setLoadFailed(true) }}
            cropperProps={{
              role: 'group',
              // Names the control, not the errand: the dialog's own title and hint already say
              // whether this square becomes a card's portrait or an avatar.
              'aria-label':
                frameLabel ??
                (aspect === 1 ? t('account.crop.thumbnailSquare') : t('account.crop.cardFrame')),
              'aria-describedby': hintId,
            }}
          />
        )}

        {loading ? (
          <p className="cropper__status" aria-live="polite">
            {t('account.crop.loading')}
          </p>
        ) : null}
      </div>
    </>
  )
}
