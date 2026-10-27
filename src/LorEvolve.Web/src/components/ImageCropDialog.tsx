import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Check, X } from 'lucide-react'
import { ApiError } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import { ActionIcon } from './ActionIcon'

/**
 * How far the author may zoom out: to the picture exactly covering the square, and no further. With
 * the position kept inside the picture as well, the square can never hold an empty corner, so a
 * thumbnail is always picture edge to edge.
 */
const MIN_ZOOM = 1

/** How far the author may zoom in. Past this a thumbnail is cut from too few pixels to be worth it. */
const MAX_ZOOM = 4

/** Pixels the square moves per arrow key; Shift moves a fifth of that, which the cropper handles. */
const KEYBOARD_STEP = 8

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

/** What a caller that reports nothing is taken to be doing: server work, with no percentage. */
const UNREPORTED: SaveStage = { kind: 'working' }

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
  hint = 'Drag the picture to place the square, or select it and use the arrow keys. The whole picture is kept; the square is what cards show.',
  workingLabel = 'Saving',
  aspect = 1,
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

  async function confirm() {
    // The guard is the one that matters: a second press, an Enter on a still-focused button or a
    // double tap cannot start a second upload, whatever the button's disabled state is doing.
    if (!crop || saving) return

    // Held from here, so the square that is submitted is the square that was on screen when the
    // button was pressed. The stage below also makes the cropper inert, so it cannot move under
    // an upload that has already been given its four numbers.
    const submitted = crop

    setStage(UNREPORTED)
    setError(null)
    try {
      await onConfirm(submitted, setStage)
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.file ?? failure.fieldErrors.crop ?? failure.message)
          : 'That could not be saved. Try again.',
      )
      setStage(null)
    }
  }

  function cancel() {
    if (!saving) onCancel()
  }

  const percent =
    stage?.kind === 'sending' && stage.ratio !== null ? Math.round(stage.ratio * 100) : null

  // "Uploading 40%" while bytes are moving, then the caller's own word for the server's part. The
  // two are deliberately different: the first can be counted and the second cannot.
  const savingLabel =
    stage === null ? null : percent === null ? workingLabel : `Uploading ${percent}%`

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
            {hint}
          </p>
        </header>

        {/* Inert, not merely unstyled, once a save starts: the crop that was submitted must not be
            able to change underneath it, by drag, by wheel or by arrow key. `pointer-events` alone
            would leave the square focusable and the keyboard still moving it. */}
        <div className="cropper__stage" data-testid="image-crop-stage" inert={saving || undefined}>
          {loadFailed ? (
            <p className="cropper__status" role="alert">
              That picture could not be loaded.
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
                'aria-label': aspect === 1 ? 'Thumbnail square' : 'Card frame',
                'aria-describedby': hintId,
              }}
            />
          )}

          {loading ? (
            <p className="cropper__status" aria-live="polite">
              Loading the picture
            </p>
          ) : null}
        </div>

        <div className="cropper__controls">
          <div className="cropper__zoom">
            <label className="field__label" htmlFor={zoomId}>
              Zoom
            </label>
            <input
              id={zoomId}
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={loading || loadFailed || saving}
              onChange={(event) => setZoom(Number(event.target.value))}
              data-testid="image-crop-zoom"
            />
          </div>

          <div className="cropper__previews" aria-hidden="true">
            {aspect === 1 ? (
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
                <span className="cropper__caption">Thumbnail preview</span>
              </>
            ) : (
              <>
                <CroppedPicture
                  className="cropper__preview cropper__preview--wide"
                  source={source}
                  crop={crop}
                  testId="image-crop-preview"
                />
                <span className="cropper__caption">Card preview</span>
              </>
            )}
          </div>

          {stage === null ? null : (
            <div className="cropper__progress" data-testid="image-crop-progress">
              {/* Determinate while the browser can count the bytes, and indeterminate after -
                  with aria-valuenow left off rather than frozen at 100, which would claim the
                  save had finished. */}
              <div
                className="progressbar"
                role="progressbar"
                aria-label={percent === null ? workingLabel : 'Uploading photo'}
                aria-valuemin={percent === null ? undefined : 0}
                aria-valuemax={percent === null ? undefined : 100}
                aria-valuenow={percent ?? undefined}
                aria-valuetext={percent === null ? undefined : `${percent}%`}
                data-state={percent === null ? 'working' : 'sending'}
                data-testid="image-crop-progressbar"
              >
                <span
                  className="progressbar__fill"
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>

              {/* The words are the status, not the animation: a bar that only moves says nothing
                  to a screen reader, and nothing at all with reduced motion. */}
              <p className="cropper__stagetext" role="status" data-testid="image-crop-stagetext">
                {percent === null ? `${workingLabel}…` : `Uploading… ${percent}%`}
              </p>
            </div>
          )}

          {error ? (
            <p className="field__error" role="alert" data-testid="image-crop-error">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="cropper__actions">
          <button
            className="button"
            type="button"
            disabled={!crop || saving}
            onClick={() => void confirm()}
            data-testid="image-crop-confirm"
          >
            <ActionIcon icon={Check} />
            {savingLabel ?? confirmLabel}
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={saving}
            onClick={cancel}
            data-testid="image-crop-cancel"
          >
            <ActionIcon icon={X} />
            Cancel
          </button>
        </footer>
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
  testId,
}: {
  source: string
  crop: ImageCrop | null
  className: string
  testId?: string
}) {
  return (
    <span className={`${className} cropped`} data-testid={testId}>
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

/**
 * The cropper's square, in whole pixels of the picture, as fractions of that same picture. Whole
 * pixels in, so the server rounds each edge straight back onto them; clamped, so floating-point
 * noise can never push an edge past the picture.
 */
function fractionsOf(area: Area, natural: { width: number; height: number }): ImageCrop {
  const x = clamp(area.x / natural.width)
  const y = clamp(area.y / natural.height)

  return {
    x,
    y,
    width: Math.min(area.width / natural.width, 1 - x),
    height: Math.min(area.height / natural.height, 1 - y),
  }
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}
