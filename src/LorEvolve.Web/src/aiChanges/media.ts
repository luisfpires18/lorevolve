import { apiFetch } from '../lib/api'
import type { Proposal } from './types'

/** The quarantined picture's preview, behind the session like every other LorEvolve picture. */
export function mediaPreviewPath(
  universeId: string,
  proposalId: string,
  operationId: string,
  uploadedAt: string,
) {
  return `/api/universes/${universeId}/ai-changes/${proposalId}/operations/${operationId}/media/thumbnail?at=${encodeURIComponent(uploadedAt)}`
}

/** Hands the picture over for a pending picture change; answers the proposal as it reads now. */
export function uploadChangeMedia(
  universeId: string,
  proposalId: string,
  operationId: string,
  file: File,
) {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<Proposal>(
    `/api/universes/${universeId}/ai-changes/${proposalId}/operations/${operationId}/media`,
    { method: 'PUT', body },
  )
}
