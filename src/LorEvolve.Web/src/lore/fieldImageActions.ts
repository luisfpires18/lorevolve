import type { Dispatch, SetStateAction } from 'react'
import type { EntityImageCrop, FieldImageRef } from './types'
import type { FieldImageApi, PendingFieldImage } from '../components/FieldImageInput'
import { pictureRatio, type Framing } from './fieldImageFraming'

/**
 * An Image field's or an entry picture's handlers: reframe the picture, keep a crop. Picking and removing are
 * `usePictureFraming`'s.
 */
export function fieldImageActions<
  Ref extends {
    assetId: string
    width: number
    height: number
    crop: EntityImageCrop | null
  } = FieldImageRef,
>({
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
  image: Ref | null
  pending: { file: File; crop: EntityImageCrop } | null
  onPending: (pending: PendingFieldImage | null) => void
  onChanged: (image: Ref | null) => void
  setError: Dispatch<SetStateAction<string | null>>
  framing: Framing<Ref> | null
  setFraming: Dispatch<SetStateAction<Framing<Ref> | null>>
  api: Pick<FieldImageApi<Ref>, 'url' | 'set' | 'setCrop'>
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
