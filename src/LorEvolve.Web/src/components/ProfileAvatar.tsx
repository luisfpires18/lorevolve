import { useEffect, useMemo, useRef, useState } from 'react'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import type { ImageCrop } from '../lib/imageCrop'
import {
  IMAGE_ACCEPT,
  IMAGE_MAX_BYTES,
  profileImageUrl,
  removeProfileImage,
  setProfileImage,
  setProfileThumbnail,
} from '../profile/api'
import type { ProfileImageRef } from '../profile/types'
import { useProfileImage } from '../profile/useProfileImage'
import { ActionIcon } from './ActionIcon'
import { Avatar } from './Avatar'
import { ImageCropDialog, type SaveStage } from './ImageCropDialog'

const CROP_HINT =
  'Drag the photo to place the square, or select it and use the arrow keys. The whole photo is kept; the square is what your avatar shows.'

/**
 * What the cropper is open on. A file just picked is framed before anything is uploaded; a photo
 * already stored is reframed from its own original, which is never sent again.
 */
type Framing =
  { kind: 'file'; file: File } | { kind: 'stored'; image: ProfileImageRef; source: string }

/**
 * The account's picture on the Profile screen: the circle, and the four things that can be done
 * to it.
 *
 * The circle is the same size and in the same place whether or not there is a photo in it, so the
 * page does not jump when one arrives or goes. Without one it carries the account's initial - a
 * monogram, not a stock silhouette, because a silhouette says "a person" and an initial says
 * "you". `Avatar` draws both, here and in the account menu, so they cannot drift.
 *
 * Every photo goes through the cropper before it goes anywhere, so a cancelled crop uploads
 * nothing. The whole picture is always kept; the square is only what the avatar shows.
 *
 * What is written is reported to `useProfileImage` rather than held here, so the rail, the folded
 * mobile bar and the universes header change at the same moment this circle does.
 */
export function ProfileAvatar({ name }: { name: string }) {
  const { image, changed } = useProfileImage()

  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [framing, setFraming] = useState<Framing | null>(null)

  // A picked file is shown from the browser's own copy of it, so nothing is uploaded to preview
  // it. Derived from the file rather than held in state - it is a value, not an event - and
  // released when the cropper closes either way.
  const pickedFile = framing?.kind === 'file' ? framing.file : null
  const pickedSource = useMemo(
    () => (pickedFile ? URL.createObjectURL(pickedFile) : null),
    [pickedFile],
  )

  useEffect(() => {
    if (!pickedSource) return

    return () => {
      URL.revokeObjectURL(pickedSource)
    }
  }, [pickedSource])

  function choose(file: File | undefined) {
    // The picker is reset either way, so choosing the same file twice after a failure still fires
    // a change event.
    if (input.current) input.current.value = ''
    if (!file) return

    setError(null)

    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Photos must be ${IMAGE_MAX_BYTES / (1024 * 1024)} MB or smaller.`)
      return
    }

    setFraming({ kind: 'file', file })
  }

  function reframe() {
    if (!image) return
    setError(null)
    setFraming({ kind: 'stored', image, source: profileImageUrl(image, 'original') })
  }

  async function keep(crop: ImageCrop, report: (stage: SaveStage) => void) {
    if (!framing) return

    if (framing.kind === 'stored') {
      // Four numbers, no file. There is nothing to count, so the dialog is told straight away that
      // this is server work - a byte percentage here would be invented.
      report({ kind: 'working' })
      changed(await setProfileThumbnail(framing.image.assetId, crop))
    } else {
      report({ kind: 'sending', ratio: 0 })
      changed(
        await setProfileImage(framing.file, crop, ({ ratio }) => {
          // The last byte out is not the photo saved: the server still has to decode it, cut the
          // square and store both. That is what the switch to an indeterminate stage says.
          report(ratio !== null && ratio >= 1 ? { kind: 'working' } : { kind: 'sending', ratio })
        }),
      )
    }

    setFraming(null)
  }

  async function remove() {
    setError(null)
    setBusy(true)
    try {
      await removeProfileImage()
      changed(null)
    } catch {
      setError('That photo could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  // A picked file is framed from its object URL; a stored one from its own original.
  const source = framing === null ? null : framing.kind === 'file' ? pickedSource : framing.source

  return (
    <div className="avatar" data-testid="profile-avatar-field">
      <Avatar image={image} name={name} className="avatar__photo" testId="profile-avatar" />

      <div className="avatar__actions">
        {/* The input comes first so the label can be styled from its state - focus and disabled
            both travel forwards through a sibling selector and not backwards. */}
        <input
          ref={input}
          id="profile-photo-input"
          className="avatar__input"
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
          data-testid="profile-photo-input"
        />

        <label
          className="button button--secondary avatar__pick"
          htmlFor="profile-photo-input"
          data-testid="profile-photo-pick"
        >
          <ActionIcon icon={image ? ImageUp : ImagePlus} />
          {image ? 'Replace photo' : 'Upload photo'}
        </label>

        {image ? (
          <>
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={reframe}
              data-testid="profile-photo-reframe"
            >
              <ActionIcon icon={Crop} />
              Edit photo
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              data-testid="profile-photo-remove"
            >
              <ActionIcon icon={ImageMinus} />
              {busy ? 'Removing' : 'Remove photo'}
            </button>
          </>
        ) : null}
      </div>

      <p className="avatar__hint">
        One photo. JPEG, PNG or WebP, up to 8 MB. Private unless you show it on your author page.
      </p>

      {error ? (
        <p className="field__error" role="alert" data-testid="profile-photo-error">
          {error}
        </p>
      ) : null}

      {framing && source ? (
        <ImageCropDialog
          // A new picture is a new cropper, never the last one's state carried over.
          key={source}
          source={source}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : null}
          title={framing.kind === 'stored' ? 'Edit photo' : 'Frame your photo'}
          confirmLabel={framing.kind === 'stored' ? 'Save photo' : 'Upload'}
          workingLabel={framing.kind === 'stored' ? 'Updating photo' : 'Processing photo'}
          hint={CROP_HINT}
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </div>
  )
}
