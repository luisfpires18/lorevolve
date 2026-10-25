import type { ImageCrop } from '../lib/imageCrop'

/**
 * The account's photo, as identifiers and pixels. No URL and no account id: the client composes
 * the address from `assetId` and `thumbnailId`, and the session already says whose photo it is.
 *
 * `crop` is what "Edit photo" reopens the cropper on, so reframing never sends the picture again.
 */
export interface ProfileImageRef {
  assetId: string
  thumbnailId: string
  width: number
  height: number
  contentType: string
  fileName: string | null
  byteSize: number
  uploadedAt: string
  crop: ImageCrop | null
}

/**
 * The account's storage, in bytes (ADR 0042): the universes it owns, against its allowance. `usedBytes` is the total;
 * `loreImagesBytes` is the one kind of file that makes it up today. Only ever the signed-in account's own.
 */
export interface AccountStorage {
  usedBytes: number
  quotaBytes: number
  remainingBytes: number
  loreImagesBytes: number
  /** The maps' originals (issue #52). Absent from an older server's answer. */
  mapImagesBytes?: number
}
