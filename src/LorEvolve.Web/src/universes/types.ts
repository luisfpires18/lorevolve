/**
 * Mirrors the backend enum: the caller's effective role in a universe. Owner comes from the universe itself; the
 * others from a membership. Not a ladder - what a role may do is decided by the API, capability by capability.
 */
export const UniverseRole = {
  Owner: 0,
  Viewer: 1,
  Reviewer: 2,
  Editor: 3,
} as const

export type UniverseRoleValue = (typeof UniverseRole)[keyof typeof UniverseRole]

/**
 * Which card of a universe's artwork is current: the two ids its owner-only address is built from, and nothing else.
 * A replaced picture gets new ids and a reframed one a new card id, so the address names one immutable image.
 */
export interface UniverseArtworkIdentity {
  assetId: string
  cardId: string
}

export interface UniverseSummary {
  id: string
  name: string
  description: string | null
  accentColor: string | null
  isArchived: boolean
  updatedAt: string
  accessRole: UniverseRoleValue
  /**
   * The owner's artwork, decided by the API: null when the universe has none, and always null for a collaborator, whose
   * role cannot read it (ADR 0041). Never "not loaded yet" - it arrives with the universe.
   */
  artwork: UniverseArtworkIdentity | null
}

export interface UniverseDetail extends UniverseSummary {
  createdAt: string
}

export interface UniversePage {
  items: UniverseSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface UniverseInput {
  name: string
  description: string | null
  accentColor: string | null
}

export interface UniverseQuery {
  search: string
  includeArchived: boolean
  page: number
}
