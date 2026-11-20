import type { Dispatch, SetStateAction } from 'react'
import type { EntityImageCrop, FieldImageRef } from './types'
import type { FieldImageApi, PendingFieldImage } from '../components/FieldImageInput'
import { pictureRatio, type Framing } from './fieldImageFraming'

/** An Image field's handlers: reframe the picture, keep a crop. Picking and removing are `usePictureFraming`'s. */
export function fieldImageActions({
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
}: {
  entityId: string | null
  image: FieldImageRef | null
  pending: PendingFieldImage | null
  onPending: (pending: PendingFieldImage | null) => void
  onChanged: (image: FieldImageRef | null) => void
  setError: Dispatch<SetStateAction<string | null>>
  framing: Framing | null
  setFraming: Dispatch<SetStateAction<Framing | null>>
  api: FieldImageApi
  fixedAspect: number | null
  preview: string | null
}) {
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

  return { reframe, keep }
}
