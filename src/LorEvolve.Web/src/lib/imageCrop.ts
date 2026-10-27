/**
 * The square a thumbnail is cut from, as fractions of the picture rather than pixels of any
 * screen: `x` and `width` of its width, `y` and `height` of its height, from the top-left corner.
 * The same four numbers select the same pixels however large the cropper happened to be drawn.
 *
 * Shared rather than owned by a feature, because the cropper is: an entry's portrait and an
 * account's photo are framed by the same dialog and cut by the same code on the server.
 */
export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

/** What may be picked in the file dialog. The API decides again by decoding the bytes. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Mirrors the API's own ceiling, so an obviously oversized file is refused without a round trip. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024
