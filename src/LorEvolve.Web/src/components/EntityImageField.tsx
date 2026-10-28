import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  entityImageUrl,
  removeEntityImage,
  setEntityImage,
  setEntityThumbnail,
} from '../lore/images'
import type { EntityImageCrop, EntityImageRef } from '../lore/types'
import { ActionIcon } from './ActionIcon'
import { CroppedPicture, ImageCropDialog } from './ImageCropDialog'

/** A picture chosen for an entry that does not exist yet, with the square the author framed. */
export interface PendingImage {
  file: File
  crop: EntityImageCrop
}

/**
 * What the cropper is open on. A file just picked is framed before anything is uploaded; a
 * picture already stored is reframed from its own original, which is never sent again.
 */
type Framing =
  | {
      kind: 'file'
      file: File
      source: string
      /** Whether `source` was made for this cropper and is released with it. */
      ownsSource: boolean
      initial: EntityImageCrop | null
    }
  | { kind: 'stored'; image: EntityImageRef; source: string }

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
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [framing, setFraming] = useState<Framing | null>(null)

  // A held file is shown from the browser's own copy of it, so nothing is uploaded to preview
  // it. The URL is derived from the file rather than stored in state - it is a value, not an
  // event - and it holds memory until it is revoked, which is what the effect below is for.
  // Keyed on the file rather than the pending pair, so reframing a held file keeps its URL.
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

  // A file picked for framing has a URL of its own, released when the cropper closes either way.
  useEffect(() => {
    if (framing?.kind !== 'file' || !framing.ownsSource) return

    const source = framing.source
    return () => {
      URL.revokeObjectURL(source)
    }
  }, [framing])

  const hasPicture = Boolean(pending || image)
  const busyOrDisabled = busy || disabled

  function choose(file: File | undefined) {
    // The picker is reset either way, so choosing the same file twice after a failure still
    // fires a change event.
    if (input.current) input.current.value = ''
    if (!file) return

    setError(null)

    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Images must be ${IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.`)
      return
    }

    setFraming({
      kind: 'file',
      file,
      source: URL.createObjectURL(file),
      ownsSource: true,
      initial: null,
    })
  }

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

  async function remove() {
    setError(null)

    if (pending) {
      onPending(null)
      return
    }

    if (!entityId || !image) return

    setBusy(true)
    try {
      await removeEntityImage(universeId, entityId)
      onChanged(null)
    } catch {
      setError('That image could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="imagefield" data-testid="entity-image-field">
      <h2 className="entryform__heading sectionrule sectionrule--accent">Picture</h2>

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
            —
          </span>
        )}

        <div className="imagefield__actions">
          {/* The input comes first so the label can be styled from its state - focus and
              disabled both travel forwards through a sibling selector and not backwards. */}
          <input
            ref={input}
            id={inputId}
            className="imagefield__input"
            type="file"
            accept={IMAGE_ACCEPT}
            disabled={busyOrDisabled}
            onChange={(event) => choose(event.target.files?.[0])}
            data-testid="entity-image-input"
          />

          <label className="button button--secondary imagefield__pick" htmlFor={inputId}>
            <ActionIcon icon={hasPicture ? ImageUp : ImagePlus} />
            {hasPicture ? 'Replace' : 'Add image'}
          </label>

          {hasPicture ? (
            <>
              <button
                className="button button--secondary"
                type="button"
                disabled={busyOrDisabled}
                onClick={reframe}
                data-testid="entity-image-reframe"
              >
                <ActionIcon icon={Crop} />
                Edit thumbnail
              </button>
              <button
                className="button button--secondary button--danger-quiet"
                type="button"
                disabled={busyOrDisabled}
                onClick={() => void remove()}
                data-testid="entity-image-remove"
              >
                <ActionIcon icon={ImageMinus} />
                {busy ? 'Removing' : 'Remove'}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <p className="imagefield__hint">
        {pending
          ? 'Added when this entry is created.'
          : 'One picture. JPEG, PNG or WebP, up to 8 MB.'}
      </p>

      {error ? (
        <p className="field__error" role="alert" data-testid="entity-image-error">
          {error}
        </p>
      ) : null}

      {framing ? (
        <ImageCropDialog
          // A new picture is a new cropper, never the last one's state carried over.
          key={framing.source}
          source={framing.source}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : framing.initial}
          title={framing.kind === 'stored' ? 'Edit thumbnail' : 'Frame the thumbnail'}
          confirmLabel={
            framing.kind === 'stored' ? 'Save thumbnail' : entityId ? 'Upload' : 'Use this picture'
          }
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </div>
  )
}
