import { apiFetch } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import { apiUpload, type UploadProgress } from '../lib/upload'
import type { AccountStorage, ProfileImageRef } from './types'

const BASE = '/api/profile/image'

// Shared with an entry's picture: the same file dialog filter and the same ceiling, because the
// same server code decides what is accepted.
export { IMAGE_ACCEPT, IMAGE_MAX_BYTES } from '../lib/imageCrop'

/**
 * Where one variant of the account's photo is served from.
 *
 * Same-origin and authenticated, and with no account id in it: the session cookie the browser
 * already holds is both the credential and the answer to whose photo this is. The asset id is in
 * both paths and the square's own id is in its path, and both are minted fresh - on every upload
 * and on every reframe - so an address always names the same bytes. That is why replacing a photo
 * needs no cache-busting trick and cannot flash the one it replaced.
 *
 * It is also under `/api`, which the service worker refuses outright (ADR 0017), so a private
 * photo never lands in the app-shell cache.
 */
export function profileImageUrl(image: ProfileImageRef, variant: 'original' | 'thumbnail') {
  return variant === 'original'
    ? `${BASE}/${image.assetId}/original`
    : `${BASE}/${image.assetId}/thumbnail/${image.thumbnailId}`
}

/** The account's photo, or null when it has none - which the API answers with 204, not a 404. */
export async function getProfileImage(signal?: AbortSignal) {
  return (await apiFetch<ProfileImageRef | undefined>(BASE, { signal })) ?? null
}

/**
 * Sets the account's photo, replacing whatever it had, framed the way it was chosen.
 *
 * The file and its framing travel in one request, so nothing is uploaded until the square has
 * been confirmed. The crop is only a request: the server cuts the avatar itself, from the original.
 *
 * Sent through `apiUpload` rather than `apiFetch`, and this is the only call in LorEvolve that is:
 * it is the only one where the body is large enough that a person waits for it, and byte progress
 * needs `XMLHttpRequest`. `onProgress` stops at the last byte out - what happens after that is
 * the server decoding and storing, which has no percentage.
 */
export function setProfileImage(
  file: File,
  crop: ImageCrop,
  onProgress?: (progress: UploadProgress) => void,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('crop', JSON.stringify(crop))

  return apiUpload<ProfileImageRef>(BASE, body, { method: 'PUT', onProgress })
}

/**
 * Cuts a new square from the photo already stored. Nothing is uploaded and the original is not
 * touched. `assetId` is the picture that was framed, so a square chosen for a photo that has since
 * been replaced is refused rather than applied to the new one.
 */
export function setProfileThumbnail(assetId: string, crop: ImageCrop) {
  return apiFetch<ProfileImageRef>(`${BASE}/thumbnail`, {
    method: 'PUT',
    body: JSON.stringify({ assetId, crop }),
  })
}

export function removeProfileImage() {
  return apiFetch<void>(BASE, { method: 'DELETE' })
}

/**
 * The name the account's published universes show as their author - the only thing about an account the
 * public portal ever shows. Null until one is chosen; never filled in from the username or the email.
 */
export async function getPublicName(signal?: AbortSignal) {
  return (
    await apiFetch<{ publicDisplayName: string | null }>('/api/profile/public-name', { signal })
  ).publicDisplayName
}

/** Sets it, or clears it with null - refused while any of the account's universes is public. */
export async function setPublicName(publicDisplayName: string | null) {
  return (
    await apiFetch<{ publicDisplayName: string | null }>('/api/profile/public-name', {
      method: 'PUT',
      body: JSON.stringify({ publicDisplayName }),
    })
  ).publicDisplayName
}

/** How much of its storage the account is using - the universes it owns, never one it only collaborates on. */
export function getAccountStorage(signal?: AbortSignal) {
  return apiFetch<AccountStorage>('/api/profile/storage', { signal })
}
