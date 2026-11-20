import { useEffect, useMemo, useState } from 'react'
import { t } from '../i18n'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { confirmAction } from './confirm'
import type { ImageCrop } from './imageCrop'
import { useImagePick } from './useImagePick'

/**
 * What a picture's cropper is open on. A file just picked is framed before anything is uploaded; a
 * picture already stored is reframed from its own original, which is never sent again. `Extra` is
 * what one place adds to both (an Image field's frame shape).
 */
export type PictureFraming<Stored, Extra extends object = object> =
  | ({
      kind: 'file'
      file: File
      source: string
      /** Whether `source` was made for this cropper and is released with it. */
      ownsSource: boolean
      initial: ImageCrop | null
    } & Extra)
  | ({ kind: 'stored'; image: Stored; source: string } & Extra)

/**
 * The state every picture control shares: the busy flag, the file picker with its size refusal, what
 * the cropper is open on, and the object URLs a picked or held file is given (released when the
 * cropper closes, or the held file goes). Choosing a file and removing a picture are here too; where
 * a picture is uploaded, and when, stays with the caller.
 *
 * `pending` is for a picture that waits until its owner is saved: the held file is previewed from the
 * browser's own copy, and Remove only lets it go. Leave it out for a picture that uploads at once.
 * Catalogue: `docs/design/ui-components.md`.
 */
export function usePictureFraming<Stored, Extra extends object = object>({
  tooBigKey,
  pending,
  onPending,
}: {
  tooBigKey: TextKey<Dictionary>
  pending?: { file: File } | null
  onPending?: (pending: null) => void
}) {
  const [busy, setBusy] = useState(false)
  const { input, error, setError, pick } = useImagePick(tooBigKey)
  const [framing, setFraming] = useState<PictureFraming<Stored, Extra> | null>(null)

  // A held file is shown from the browser's own copy of it, so nothing is uploaded to preview it.
  // Derived from the file rather than stored - a value, not an event - and held in memory until the
  // effect revokes it. Keyed on the file, so reframing a held file keeps its URL.
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

  /** Picks a file and opens the cropper on it; `extra` adds what the framing carries beyond the file. */
  async function choose(chosen: File | undefined, extra?: (source: string) => Promise<Extra>) {
    // The picker is reset either way, so choosing the same file twice after a failure still fires
    // a change event.
    const file = pick(chosen)
    if (!file) return

    const source = URL.createObjectURL(file)
    setFraming({
      kind: 'file',
      file,
      source,
      ownsSource: true,
      initial: null,
      ...(extra ? await extra(source) : {}),
    } as PictureFraming<Stored, Extra>)
  }

  /**
   * Takes the picture away. A held one is only let go. A stored one is asked about first, then `run`
   * deletes it, `done` tells the owner, and `failed` words the refusal. `stored` is false when there
   * is nothing stored to delete.
   */
  async function remove({
    stored,
    run,
    done,
    failed,
  }: {
    stored: boolean
    run: () => Promise<void>
    done: () => void
    failed: (problem: unknown) => string
  }) {
    setError(null)

    if (pending) {
      onPending?.(null)
      return
    }

    if (!stored) return
    const confirmed = await confirmAction({
      title: t('shell.confirm.removePicture.title'),
      message: t('shell.confirm.removePicture.message'),
      confirmLabel: t('shell.confirm.removePicture.confirm'),
      variant: 'destructive',
    })
    if (!confirmed) return

    setBusy(true)
    try {
      await run()
      done()
    } catch (problem: unknown) {
      setError(failed(problem))
    } finally {
      setBusy(false)
    }
  }

  return { input, error, setError, pick, busy, framing, setFraming, preview, choose, remove }
}
