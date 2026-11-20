import type { FieldImageRef } from './types'
import type { PictureFraming } from '../lib/usePictureFraming'

/** What an Image field's cropper is open on: the shared framing, with the frame's width over its height. */
export type Framing = PictureFraming<FieldImageRef, { aspect: number }>

/** The picture's own width over its height, as the browser draws it. */
export function pictureRatio(source: string) {
  return new Promise<number>((resolve) => {
    const probe = new Image()
    probe.onload = () => resolve(probe.naturalWidth / probe.naturalHeight || 1)
    probe.onerror = () => resolve(1)
    probe.src = source
  })
}
