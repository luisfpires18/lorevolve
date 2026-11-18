import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Area } from 'react-easy-crop'
import type { ImageCrop } from '../lib/imageCrop'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'
import { CropperActions } from './CropperActions'
import { CropperControls } from './CropperControls'
import { CropperProgress } from './CropperProgress'
import { CropperStage } from './CropperStage'
import { cropDialogActions } from './cropDialogActions'
import { fractionsOf } from './cropMath'

/**
 * How far a save has got, as the caller reports it.
 *
 * Two stages, because they are two different waits and saying so is the whole point. `sending` is
 * the browser pushing bytes, which is countable and can be most of the wait on a phone. `working`
 * is the server decoding the picture, cutting the square and storing both, which has no
 * percentage - and reaching 100% uploaded does not mean the photo is saved.
 *
 * `ratio` is null when the browser cannot say how many bytes there are, which is why the bar falls
 * back to an indeterminate one rather than inventing a number.
 */
export type SaveStage = { kind: 'sending'; ratio: number | null } | { kind: 'working' }

/**
 * The cropper: the whole picture, a square over it, and the choice of which part the thumbnail
 * shows.
 *
 * It only ever *chooses*. What it hands back is four fractions of the picture, worked out from
 * whole pixels of the picture's own size - never a canvas, never a blob, never a position on this
 * screen - and the server cuts the thumbnail from the original itself. The same square therefore
 * comes out whatever size the cropper was drawn at, and a browser cannot hand the API a thumbnail
 * that does not match the picture.
 *
 * The picture is drawn by the browser the way every other `img` in LorEvolve draws it, EXIF
 * orientation included, and the fractions are of that picture - which is the one the server
 * measures against too.
 *
 * Cancel, Escape and a failed confirm all leave everything as it was. A click on the backdrop does
 * nothing, deliberately: a drag that ends outside the picture would otherwise read as one.
 */
export function ImageCropDialog({
  source,
  initialCrop,
  title,
  confirmLabel,
  hint,
  workingLabel,
  aspect = 1,
  frameLabel,
  onConfirm,
  onCancel,
}: {
  /** An object URL for a file not yet uploaded, or the stored original's own address. */
  source: string
  /**
   * The frame's width over its height. 1 is every thumbnail and avatar; a universe's artwork is framed at
   * 16:10 for its card. The server cuts the same shape and refuses any other.
   */
  aspect?: number
  /**
   * Names the frame when it is neither the square nor the card: an Image field's own crop shape. It labels the
   * cropper and the preview, and the preview is drawn at the frame's own ratio.
   */
  frameLabel?: string
  /** Where the square starts. Null starts on the centred square. */
  initialCrop: ImageCrop | null
  title: string
  confirmLabel: string
  /** What the square is for, in the caller's own words. It is the dialog's description. */
  hint?: string
  /** What the button says while the work has no percentage. "Processing" for an upload. */
  workingLabel?: string
  /**
   * Resolves once the choice is kept; throws to keep the dialog open with the reason shown.
   *
   * `report` is how the save says which stage it is at. A caller that never calls it is taken to
   * be doing server work, which is right for anything that sends no file - reframing sends four
   * numbers, and a percentage there would be a fiction.
   */
  onConfirm: (crop: ImageCrop, report: (stage: SaveStage) => void) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useI18n()
  const shownHint = hint ?? t('account.crop.hint')
  const shownWorking = workingLabel ?? t('account.crop.working')
  const dialog = useRef<HTMLDialogElement>(null)
  const headingId = useId()
  const hintId = useId()
  const zoomId = useId()

  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [pixels, setPixels] = useState<Area | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [stage, setStage] = useState<SaveStage | null>(null)
  const [error, setError] = useState<string | null>(null)

  // One flag for "a save is in flight", derived rather than stored: two pieces of state that had
  // to agree would eventually not.
  const saving = stage !== null
  useReturnFocus()

  useEffect(() => {
    // showModal, not the open attribute: it brings the focus trap, the backdrop and Escape.
    dialog.current?.showModal()
  }, [])

  // Read once, on mount: the cropper only consults its starting square when the picture loads.
  const [startingArea] = useState(() =>
    initialCrop
      ? {
          x: initialCrop.x * 100,
          y: initialCrop.y * 100,
          width: initialCrop.width * 100,
          height: initialCrop.height * 100,
        }
      : undefined,
  )

  const crop = useMemo(
    () => (pixels && natural ? fractionsOf(pixels, natural) : null),
    [pixels, natural],
  )

  const loading = !natural && !loadFailed

  const { confirm, cancel } = cropDialogActions({
    crop,
    saving,
    setStage,
    setError,
    onConfirm,
    onCancel,
    t,
  })

  const percent =
    stage?.kind === 'sending' && stage.ratio !== null ? Math.round(stage.ratio * 100) : null

  // "Uploading 40%" while bytes are moving, then the caller's own word for the server's part. The
  // two are deliberately different: the first can be counted and the second cannot.
  const savingLabel =
    stage === null
      ? null
      : percent === null
        ? shownWorking
        : t('account.crop.uploadingPercent', { percent })

  return (
    <dialog
      className="cropper"
      ref={dialog}
      aria-labelledby={headingId}
      aria-describedby={hintId}
      onCancel={(event) => {
        event.preventDefault()
        cancel()
      }}
      data-testid="image-crop-dialog"
    >
      <div className="cropper__panel">
        <header className="cropper__head">
          <h2 className="cropper__title" id={headingId}>
            {title}
          </h2>
          <p className="cropper__hint" id={hintId}>
            {shownHint}
          </p>
        </header>

        <CropperStage
          source={source}
          aspect={aspect}
          frameLabel={frameLabel}
          hintId={hintId}
          position={position}
          zoom={zoom}
          startingArea={startingArea}
          loadFailed={loadFailed}
          loading={loading}
          saving={saving}
          setPosition={setPosition}
          setZoom={setZoom}
          setPixels={setPixels}
          setNatural={setNatural}
          setLoadFailed={setLoadFailed}
        />

        <div className="cropper__controls">
          <CropperControls
            zoomId={zoomId}
            zoom={zoom}
            loading={loading}
            loadFailed={loadFailed}
            saving={saving}
            setZoom={setZoom}
            source={source}
            crop={crop}
            aspect={aspect}
            frameLabel={frameLabel}
          />

          <CropperProgress
            stage={stage}
            percent={percent}
            shownWorking={shownWorking}
            error={error}
          />
        </div>

        <CropperActions
          crop={crop}
          saving={saving}
          confirm={confirm}
          cancel={cancel}
          savingLabel={savingLabel}
          confirmLabel={confirmLabel}
        />
      </div>
    </dialog>
  )
}

/**
 * A square window onto part of a picture, drawn by the browser rather than rendered to a canvas.
 *
 * Used for previews of a choice that has not been saved - in the cropper, and in the editor for a
 * picture that is waiting for its entry to exist. A stored picture has a real thumbnail and uses
 * that instead.
 */
export function CroppedPicture({
  source,
  crop,
  className,
  style,
  testId,
}: {
  source: string
  crop: ImageCrop | null
  className: string
  style?: CSSProperties
  testId?: string
}) {
  return (
    <span className={`${className} cropped`} style={style} data-testid={testId}>
      {crop ? (
        <img
          className="cropped__image"
          src={source}
          alt=""
          // The picture is scaled so the square fills the window, then shifted so the square is
          // what shows. Percentages of the window, so the same crop fits any window size.
          style={{
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
          }}
        />
      ) : null}
    </span>
  )
}
