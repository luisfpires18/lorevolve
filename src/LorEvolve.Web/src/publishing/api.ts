import { apiFetch } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import { apiUpload, type UploadProgress } from '../lib/upload'
import type { UniverseArtworkIdentity } from '../universes/types'
import type {
  ContentKind,
  ContentPublicationState,
  PublicationDetails,
  PublicationState,
  PublicAuthorSettings,
  SelectedLore,
  StoryPartKind,
  StoryPartPublicationState,
  UniverseArtworkRef,
} from './types'

const base = (universeId: string) => `/api/universes/${universeId}`

export function getPublication(universeId: string, signal?: AbortSignal) {
  return apiFetch<PublicationState>(`${base(universeId)}/publication`, { signal })
}

/** The entries publishing would make public, for the owner to review in the confirmation. Reads only. */
export function getSelectedLore(universeId: string, signal?: AbortSignal) {
  return apiFetch<SelectedLore>(`${base(universeId)}/publication/selected-lore`, { signal })
}

/** Saves the public details. Visibility is never part of it: only publish and unpublish change that. */
export function savePublication(universeId: string, details: PublicationDetails) {
  return apiFetch<PublicationState>(`${base(universeId)}/publication`, {
    method: 'PUT',
    body: JSON.stringify(details),
  })
}

export function publishUniverse(universeId: string) {
  return apiFetch<PublicationState>(`${base(universeId)}/publish`, { method: 'POST' })
}

export function unpublishUniverse(universeId: string) {
  return apiFetch<PublicationState>(`${base(universeId)}/unpublish`, { method: 'POST' })
}

/**
 * Where the owner reads one of the artwork's two objects - public or not, and only with their session. The
 * public card has an address of its own, in the public API, which answers only while the universe is public.
 *
 * Only the ids are needed, so it takes the identity a universe carries as readily as the full artwork record.
 */
export function artworkUrl(
  universeId: string,
  artwork: UniverseArtworkIdentity,
  variant: 'original' | 'card',
) {
  return variant === 'original'
    ? `${base(universeId)}/artwork/${artwork.assetId}/original`
    : `${base(universeId)}/artwork/${artwork.assetId}/card/${artwork.cardId}`
}

/** Sets the artwork, replacing any, framed as it was chosen; the server cuts the card itself. */
export function setArtwork(
  universeId: string,
  file: File,
  crop: ImageCrop,
  onProgress?: (progress: UploadProgress) => void,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('crop', JSON.stringify(crop))

  return apiUpload<UniverseArtworkRef>(`${base(universeId)}/artwork`, body, {
    method: 'PUT',
    onProgress,
  })
}

/** Cuts a new card from the artwork already stored; refused if it has been replaced since. */
export function setArtworkCard(universeId: string, assetId: string, crop: ImageCrop) {
  return apiFetch<UniverseArtworkRef>(`${base(universeId)}/artwork/card`, {
    method: 'PUT',
    body: JSON.stringify({ assetId, crop }),
  })
}

export function removeArtwork(universeId: string) {
  return apiFetch<void>(`${base(universeId)}/artwork`, { method: 'DELETE' })
}

/** The owner's routes for one entry's or story's publication: read, and the two transitions. */
function contentBase(universeId: string, kind: ContentKind, id: string) {
  return `${base(universeId)}/${kind === 'entry' ? 'entities' : 'stories'}/${id}`
}

export function getContentPublication(
  universeId: string,
  kind: ContentKind,
  id: string,
  signal?: AbortSignal,
) {
  return apiFetch<ContentPublicationState>(`${contentBase(universeId, kind, id)}/publication`, {
    signal,
  })
}

/** Selects the item. Its universe's visibility is its own and is never changed by this. */
export function publishContent(universeId: string, kind: ContentKind, id: string) {
  return apiFetch<ContentPublicationState>(`${contentBase(universeId, kind, id)}/publish`, {
    method: 'POST',
  })
}

/** Saves a story's public summary - on its publication route, never by a story save. Blank removes it. */
export function saveStoryPublicSummary(
  universeId: string,
  storyId: string,
  publicSummary: string | null,
) {
  return apiFetch<ContentPublicationState>(
    `${contentBase(universeId, 'story', storyId)}/publication`,
    {
      method: 'PUT',
      body: JSON.stringify({ publicSummary }),
    },
  )
}

export function unpublishContent(universeId: string, kind: ContentKind, id: string) {
  return apiFetch<ContentPublicationState>(`${contentBase(universeId, kind, id)}/unpublish`, {
    method: 'POST',
  })
}

export function getPublicAuthorSettings(signal?: AbortSignal) {
  return apiFetch<PublicAuthorSettings>('/api/profile/public-author', { signal })
}

/** Shows or hides the account's photo on its public author page. Hiding is immediate. */
export function setPublicAuthorPhoto(isPublic: boolean) {
  return apiFetch<PublicAuthorSettings>('/api/profile/public-author/photo', {
    method: 'PUT',
    body: JSON.stringify({ isPublic }),
  })
}

/** The route that selects a story part for the story's public page, or takes it back (ADR 0039). */
function partRoute(universeId: string, storyId: string, kind: StoryPartKind, id: string) {
  const story = `${base(universeId)}/stories/${storyId}`
  return kind === 'arc'
    ? `${story}/plot-arcs/${id}`
    : kind === 'manuscript'
      ? `${story}/scenes/${id}/manuscript`
      : `${story}/scenes/${id}`
}

export function setStoryPartPublication(
  universeId: string,
  storyId: string,
  kind: StoryPartKind,
  id: string,
  publish: boolean,
) {
  return apiFetch<StoryPartPublicationState>(
    `${partRoute(universeId, storyId, kind, id)}/${publish ? 'publish' : 'unpublish'}`,
    { method: 'POST' },
  )
}
