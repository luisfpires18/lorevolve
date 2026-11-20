import { useRef, useState } from 'react'
import { t } from '../i18n'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { IMAGE_MAX_BYTES } from './imageCrop'

/**
 * Picking one image file: resets the picker every time (so the same file twice still fires),
 * clears the last refusal, refuses a file over `IMAGE_MAX_BYTES` with `tooBigKey` (given `{mb}`),
 * and hands any other file back. The caller frames, previews and uploads it.
 * Catalogue: `docs/design/ui-components.md`.
 */
export function useImagePick(tooBigKey: TextKey<Dictionary>) {
  const input = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  function pick(file: File | undefined): File | null {
    if (input.current) input.current.value = ''
    if (!file) return null
    setError(null)
    if (file.size > IMAGE_MAX_BYTES) {
      setError(t(tooBigKey, { mb: IMAGE_MAX_BYTES / (1024 * 1024) }))
      return null
    }
    return file
  }

  return { input, error, setError, pick }
}
