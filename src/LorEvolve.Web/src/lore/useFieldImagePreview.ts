import { useEffect, useMemo } from 'react'
import type { PendingFieldImage } from '../components/FieldImageInput'
import type { Framing } from './fieldImageFraming'

/** The preview of a held file, and the release of the object URLs a picked or held file was given. */
export function useFieldImagePreview({
  pending,
  framing,
}: {
  pending: PendingFieldImage | null
  framing: Framing | null
}) {
  // A held file is previewed from the browser's own copy, so nothing is uploaded to preview it.
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

  // A file picked for cropping has a URL of its own, released when the cropper closes either way.
  useEffect(() => {
    if (framing?.kind !== 'file' || !framing.ownsSource) return

    const source = framing.source
    return () => {
      URL.revokeObjectURL(source)
    }
  }, [framing])

  return { preview }
}
