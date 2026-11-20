import type { Dispatch, SetStateAction } from 'react'
import type { EntityImageCrop, FieldImageRef } from './types'
import type { FieldImageApi, PendingFieldImage } from '../components/FieldImageInput'
import { pictureRatio, type Framing } from './fieldImageFraming'
import type { useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'

/** An Image field's handlers: pick a file, reframe the picture, keep a crop, remove the picture. */
export function fieldImageActions({
  entityId,
  image,
  pending,
  onPending,
  onChanged,
  t,
  pick,
  setBusy,
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
  pick: (file: File | undefined) => File | null
  setBusy: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  framing: Framing | null
  setFraming: Dispatch<SetStateAction<Framing | null>>
  api: FieldImageApi
  fixedAspect: number | null
  preview: string | null
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  async function choose(chosen: File | undefined) {
    const file = pick(chosen)
    if (!file) return

    const source = URL.createObjectURL(file)
    const aspect = fixedAspect ?? (await pictureRatio(source))
    setFraming({ kind: 'file', file, source, ownsSource: true, initial: null, aspect })
  }

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

  async function remove() {
    setError(null)

    if (pending) {
      onPending(null)
      return
    }

    if (!entityId || !image) return
    const confirmed = await confirmAction({
      title: t('shell.confirm.removePicture.title'),
      message: t('shell.confirm.removePicture.message'),
      confirmLabel: t('shell.confirm.removePicture.confirm'),
      variant: 'destructive',
    })
    if (!confirmed) return

    setBusy(true)
    try {
      await api.remove()
      onChanged(null)
    } catch {
      setError(t('entity.image.removeFailed'))
    } finally {
      setBusy(false)
    }
  }

  return { choose, reframe, keep, remove }
}
