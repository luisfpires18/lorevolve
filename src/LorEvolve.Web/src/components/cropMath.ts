import type { Area } from 'react-easy-crop'
import type { ImageCrop } from '../lib/imageCrop'

/**
 * How far the author may zoom out: to the picture exactly covering the square, and no further. With
 * the position kept inside the picture as well, the square can never hold an empty corner, so a
 * thumbnail is always picture edge to edge.
 */
export const MIN_ZOOM = 1

/** How far the author may zoom in. Past this a thumbnail is cut from too few pixels to be worth it. */
export const MAX_ZOOM = 4

/** Pixels the square moves per arrow key; Shift moves a fifth of that, which the cropper handles. */
export const KEYBOARD_STEP = 8

/**
 * The cropper's square, in whole pixels of the picture, as fractions of that same picture. Whole
 * pixels in, so the server rounds each edge straight back onto them; clamped, so floating-point
 * noise can never push an edge past the picture.
 */
export function fractionsOf(area: Area, natural: { width: number; height: number }): ImageCrop {
  const x = clamp(area.x / natural.width)
  const y = clamp(area.y / natural.height)

  return {
    x,
    y,
    width: Math.min(area.width / natural.width, 1 - x),
    height: Math.min(area.height / natural.height, 1 - y),
  }
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value))
}
