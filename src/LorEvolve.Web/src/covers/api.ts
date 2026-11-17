import { apiFetch } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import { apiUpload, type UploadProgress } from '../lib/upload'
import { CARD_ASPECT, type UniverseArtworkRef } from '../publishing/types'

/**
 * One stored picture with a framed card, at a route of its own: a universe's artwork, a story's cover or a project's
 * cover. They share the server's pipeline and one shape (`UniverseArtworkRef`), so they share these calls, and the
 * artwork field draws any of them. `words` names the copy the field uses; `aspect` is the card's frame.
 */
export interface PictureStore {
  path: string
  aspect: number
  words: 'universe.artwork' | 'projects.cover' | 'stories.cover'
}

/** A story's cover is a book's: a 2:3 portrait. The server cuts and checks the same shape. */
export const BOOK_ASPECT = 2 / 3

export const artworkStore = (universeId: string): PictureStore => ({
  path: `/api/universes/${universeId}/artwork`,
  aspect: CARD_ASPECT,
  words: 'universe.artwork',
})

export const storyCoverStore = (universeId: string, storyId: string): PictureStore => ({
  path: `/api/universes/${universeId}/stories/${storyId}/cover`,
  aspect: BOOK_ASPECT,
  words: 'stories.cover',
})

/** A project's cover is a console's screen: the same wide 16:10 frame as a universe's card. */
export const projectCoverStore = (projectId: string): PictureStore => ({
  path: `/api/projects/${projectId}/cover`,
  aspect: CARD_ASPECT,
  words: 'projects.cover',
})

export function pictureUrl(
  store: PictureStore,
  picture: Pick<UniverseArtworkRef, 'assetId' | 'cardId'>,
  variant: 'original' | 'card',
) {
  return variant === 'original'
    ? `${store.path}/${picture.assetId}/original`
    : `${store.path}/${picture.assetId}/card/${picture.cardId}`
}

/** Stores the picture, replacing any, framed as it was chosen; the server cuts the card itself. */
export function setPicture(
  store: PictureStore,
  file: File,
  crop: ImageCrop,
  onProgress?: (progress: UploadProgress) => void,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('crop', JSON.stringify(crop))
  return apiUpload<UniverseArtworkRef>(store.path, body, { method: 'PUT', onProgress })
}

/** Cuts a new card from the picture already stored; refused if it has been replaced since. */
export function setPictureCard(store: PictureStore, assetId: string, crop: ImageCrop) {
  return apiFetch<UniverseArtworkRef>(`${store.path}/card`, {
    method: 'PUT',
    body: JSON.stringify({ assetId, crop }),
  })
}

export function removePicture(store: PictureStore) {
  return apiFetch<void>(store.path, { method: 'DELETE' })
}
