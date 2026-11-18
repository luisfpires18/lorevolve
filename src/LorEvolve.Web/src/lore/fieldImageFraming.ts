import type { EntityImageCrop, FieldImageRef } from './types'

/** What the cropper is open on: a file just picked, or a stored picture reframed from its own original. */
export type Framing =
  | {
      kind: 'file'
      file: File
      source: string
      ownsSource: boolean
      initial: EntityImageCrop | null
      aspect: number
    }
  | { kind: 'stored'; image: FieldImageRef; source: string; aspect: number }

/** The picture's own width over its height, as the browser draws it. */
export function pictureRatio(source: string) {
  return new Promise<number>((resolve) => {
    const probe = new Image()
    probe.onload = () => resolve(probe.naturalWidth / probe.naturalHeight || 1)
    probe.onerror = () => resolve(1)
    probe.src = source
  })
}
