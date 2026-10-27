/**
 * A map's picture as identifiers and pixels (issue #52, ADR 0060). No URL: the client composes both addresses from
 * `assetId`, which is new for every upload, so an address always names the same bytes. `width` and `height` are the
 * original as displayed - the space every pin's fractions are measured against.
 */
export interface MapImageRef {
  assetId: string
  width: number
  height: number
  contentType: string
  fileName: string | null
  byteSize: number
  uploadedAt: string
}

export interface MapSummary {
  id: string
  name: string
  description: string | null
  image: MapImageRef
  pinCount: number
  createdAt: string
  updatedAt: string
}

/**
 * The entry a pin stands for. `name` and `typeName` are null for an entry in the Trash - not every member may read
 * what the Trash holds - and `isTrashed` says so; the pin's own title still names the place.
 */
export interface MapPinLore {
  id: string
  name: string | null
  typeName: string | null
  typeIcon: string | null
  typeAccentColor: string | null
  isTrashed: boolean
}

/**
 * One pin. `x` and `y` are fractions of the displayed picture, 0 at the left and top edges, 1 at the right and bottom.
 * `placedOnCurrentImage` is false for a pin placed on a picture the map has since replaced: it is shown where it was,
 * as a position the author has yet to confirm.
 */
export interface MapPin {
  id: string
  title: string
  note: string | null
  x: number
  y: number
  lore: MapPinLore | null
  placedOnCurrentImage: boolean
  createdAt: string
  updatedAt: string
}

/**
 * The creator's scale for a map (issue #53, ADR 0061): two points as fractions of the picture, the fictional distance between
 * them in a unit the creator named (kept as written, never converted), and the picture it was measured on. `unitsPerPixel`
 * is that distance over the points' separation in pixels of the displayed picture.
 */
export interface MapCalibration {
  assetId: string
  x1: number
  y1: number
  x2: number
  y2: number
  distance: number
  unit: string
  unitsPerPixel: number
  updatedAt: string
}

export interface MapCalibrationInput {
  x1: number
  y1: number
  x2: number
  y2: number
  distance: number
  unit: string
}

export interface MapDetail {
  id: string
  name: string
  description: string | null
  image: MapImageRef
  pins: MapPin[]
  pinsAwaitingReview: number
  /** The edit version of the details (name, description), named by a save (ADR 0043). */
  version: number
  createdAt: string
  updatedAt: string
  /** The creator's scale, or null: without one the map locates places but measures nothing. */
  calibration: MapCalibration | null
}

export interface MapPinInput {
  title: string
  note: string | null
  x: number
  y: number
  entityId: string | null
}

/** Where one entry is pinned: the map and the pin on it. One per map at most. */
export interface EntityMapPin {
  mapId: string
  mapName: string
  pinId: string
  title: string
  x: number
  y: number
}

/** What a replacement does with the pins placed on the picture it replaces. */
export type ReplacePinsPolicy = 'keep' | 'remove'

export const MAP_NAME_MAX_LENGTH = 120
export const MAP_UNIT_MAX_LENGTH = 40
export const MAP_NOTE_MAX_LENGTH = 2000
