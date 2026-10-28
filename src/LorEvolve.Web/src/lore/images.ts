import { apiFetch } from '../lib/api'
import type { EntityImageCrop, EntityImageRef } from './types'

// Shared with the profile photo, which the same cropper frames and the same server code cuts.
export { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from '../lib/imageCrop'

function base(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/image`
}

/**
 * Where one variant of one asset is served from.
 *
 * Same-origin and authenticated: the session cookie the browser already holds is what proves
 * the image may be read, and no URL anywhere points at the bucket. The asset id is in both paths
 * and the thumbnail's own id is in its path, and both are minted fresh - on every upload, and on
 * every new framing - so an address always names the same bytes. That is why neither a
 * replacement nor a reframing needs a cache-busting trick, and neither can flash the picture it
 * replaced.
 *
 * It is also under `/api`, which the service worker refuses outright (ADR 0017), so a private
 * picture never lands in the app-shell cache.
 */
export function entityImageUrl(
  universeId: string,
  entityId: string,
  image: EntityImageRef,
  variant: 'original' | 'thumbnail',
) {
  return variant === 'original'
    ? `${base(universeId, entityId)}/${image.assetId}/original`
    : `${base(universeId, entityId)}/${image.assetId}/thumbnail/${image.thumbnailId}`
}

/**
 * Sets the entry's primary image, replacing whatever it had, framed the way the author chose.
 *
 * The file and its framing travel in one request, so nothing is uploaded until the author has
 * confirmed the crop. The crop is only a request: the server cuts the thumbnail itself.
 *
 * PUT, not POST: the session cookie is `SameSite=Strict` and a scripted cross-site PUT is forced
 * through a CORS preflight, so neither an HTML form nor a fetch from another site can reach this.
 */
export function setEntityImage(
  universeId: string,
  entityId: string,
  file: File,
  crop: EntityImageCrop,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('crop', JSON.stringify(crop))

  return apiFetch<EntityImageRef>(base(universeId, entityId), { method: 'PUT', body })
}

/**
 * Cuts a new thumbnail from the picture the entry already has. Nothing is uploaded and the
 * original is not touched. `assetId` is the picture the author framed, so a framing chosen for a
 * picture that has since been replaced is refused rather than applied to the new one.
 */
export function setEntityThumbnail(
  universeId: string,
  entityId: string,
  assetId: string,
  crop: EntityImageCrop,
) {
  return apiFetch<EntityImageRef>(`${base(universeId, entityId)}/thumbnail`, {
    method: 'PUT',
    body: JSON.stringify({ assetId, crop }),
  })
}

export function removeEntityImage(universeId: string, entityId: string) {
  return apiFetch<void>(base(universeId, entityId), { method: 'DELETE' })
}
