import { apiFetch } from '../lib/api'
import { apiUpload, type UploadProgress } from '../lib/upload'
import type {
  EntityMapPin,
  MapDetail,
  MapPin,
  MapPinInput,
  MapSummary,
  ReplacePinsPolicy,
} from './types'

// Shared with every picture: the same gate decides again by decoding the bytes.
export {
  IMAGE_ACCEPT as MAP_IMAGE_ACCEPT,
  IMAGE_MAX_BYTES as MAP_IMAGE_MAX_BYTES,
} from '../lib/imageCrop'

function base(universeId: string) {
  return `/api/universes/${universeId}/maps`
}

/** The Maps section of a universe. */
export function mapsPath(universeId: string) {
  return `/app/universes/${universeId}/maps`
}

/**
 * One map's page, optionally opened on one pin: `?pin=` is the deep link the entry's page and the assistant's sources
 * use, read on arrival and after a reload. Ids only, never a name.
 */
export function mapPath(universeId: string, mapId: string, pinId?: string | null) {
  return `${mapsPath(universeId)}/${mapId}${pinId ? `?pin=${pinId}` : ''}`
}

/**
 * Where one variant of a map's picture is served from: same-origin and authenticated, under `/api` so the service worker
 * never caches it, and immutable because the asset id is in the path and never reused. `display` is the fitted WebP the
 * viewer draws; `original` is the file as uploaded.
 */
export function mapImageUrl(
  universeId: string,
  mapId: string,
  assetId: string,
  variant: 'display' | 'original',
) {
  return `${base(universeId)}/${mapId}/image/${assetId}/${variant}`
}

export function listMaps(universeId: string, signal?: AbortSignal) {
  return apiFetch<MapSummary[]>(base(universeId), { signal })
}

export function getMap(universeId: string, mapId: string, signal?: AbortSignal) {
  return apiFetch<MapDetail>(`${base(universeId)}/${mapId}`, { signal })
}

/** A new map: its picture and details in one request, so a map never exists without a picture. Reports upload progress. */
export function createMap(
  universeId: string,
  input: { name: string; description: string | null; file: File },
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
) {
  const body = new FormData()
  body.append('file', input.file)
  body.append('name', input.name)
  if (input.description) body.append('description', input.description)
  return apiUpload<MapDetail>(base(universeId), body, { method: 'POST', onProgress, signal })
}

export function updateMapDetails(
  universeId: string,
  mapId: string,
  input: { name: string; description: string | null; expectedVersion: number },
) {
  return apiFetch<MapDetail>(`${base(universeId)}/${mapId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/**
 * A new picture for the map, with the author's explicit decision about the pins placed on the old one: kept where they
 * are and marked for review, or removed. The server refuses a replacement that says neither.
 */
export function replaceMapImage(
  universeId: string,
  mapId: string,
  file: File,
  pins: ReplacePinsPolicy,
  onProgress?: (progress: UploadProgress) => void,
  signal?: AbortSignal,
) {
  const body = new FormData()
  body.append('file', file)
  body.append('pins', pins)
  return apiUpload<MapDetail>(`${base(universeId)}/${mapId}/image`, body, { onProgress, signal })
}

/** Deletes the map and its pins for good. Maps do not go to the Trash (ADR 0060). */
export function deleteMap(universeId: string, mapId: string) {
  return apiFetch<void>(`${base(universeId)}/${mapId}`, { method: 'DELETE' })
}

export function createPin(universeId: string, mapId: string, input: MapPinInput) {
  return apiFetch<MapPin>(`${base(universeId)}/${mapId}/pins`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** Saves a pin whole. Saving confirms its position against the picture the map shows now. */
export function updatePin(universeId: string, mapId: string, pinId: string, input: MapPinInput) {
  return apiFetch<MapPin>(`${base(universeId)}/${mapId}/pins/${pinId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deletePin(universeId: string, mapId: string, pinId: string) {
  return apiFetch<void>(`${base(universeId)}/${mapId}/pins/${pinId}`, { method: 'DELETE' })
}

/** Every map one entry is pinned on, by map name. */
export function listEntityMapPins(universeId: string, entityId: string, signal?: AbortSignal) {
  return apiFetch<EntityMapPin[]>(`/api/universes/${universeId}/entities/${entityId}/map-pins`, {
    signal,
  })
}

/** A stable code on a refused pin: the entry is already pinned on this map, by the pin the problem names. */
export const DUPLICATE_LINK_CODE = 'map_pin_duplicate_link'

/** The details were saved over a version that is no longer current. */
export const MAP_CHANGED_CODE = 'map_changed'
