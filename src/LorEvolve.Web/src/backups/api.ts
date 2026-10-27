import { ApiError, apiFetch } from '../lib/api'
import { apiUpload, type UploadProgress } from '../lib/upload'
import type { UniverseDetail } from '../universes/types'

/**
 * Restoring a backup as a new universe: upload the file to be checked, then restore what was
 * checked under a name. See ADR 0032.
 *
 * The file is sent once. The server keeps it for a short while behind the token it answers with,
 * and the restore names only that token and the new name - never the preview, which the server
 * counted itself and does not take back.
 */

/** The server's own ceiling on the file as uploaded; checked here first so a huge file is never sent. */
export const MAX_BACKUP_BYTES = 512 * 1024 * 1024

export interface BackupPreviewCounts {
  entityTypes: number
  entries: number
  entriesInTrash: number
  entryVersions: number
  articles: number
  articleVersions: number
  images: number
  relationshipTypes: number
  relationships: number
  eras: number
  timelineEntries: number
  stories: number
  chapters: number
  scenes: number
  plotArcs: number
  plotBeats: number
  manuscripts: number
  manuscriptVersions: number
  storyItemsInTrash: number
  ideas: number
  ideasDeleted: number
  dismissedConflicts: number
  worldRules: number
  worldRulesInTrash: number
  /** Maps and their pins (issue #52). Absent from a preview written before them. */
  maps?: number
  mapPins?: number
  /** Idea boards (ADR 0066). Absent from a preview written before them. */
  ideaBoards?: number
}

export interface BackupPreview {
  universeName: string
  description: string | null
  accentColor: string | null
  isArchived: boolean
  formatVersion: number
  generatedAt: string
  nameAvailable: boolean
  counts: BackupPreviewCounts
}

export interface BackupValidation {
  token: string
  expiresAt: string
  preview: BackupPreview
}

export interface BackupIssue {
  code: string
  message: string
}

/** Why a backup cannot be restored, as the server said it. */
export interface BackupRefusal {
  code: string | null
  detail: string
  issues: BackupIssue[]
  moreIssues: number
}

/** Codes the restore screen answers differently from a plain failure. */
export const RESTORE_EXPIRED = 'backup_restore_expired'

export function validateBackup(
  file: File,
  options: { onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal } = {},
) {
  return apiUpload<BackupValidation>('/api/backups/validate', file, { method: 'PUT', ...options })
}

export function restoreBackup(token: string, name: string) {
  return apiFetch<UniverseDetail>('/api/backups/restore', {
    method: 'POST',
    body: JSON.stringify({ token, name }),
  })
}

/** Lets the server drop a checked file nobody is going to restore. Best effort: it expires anyway. */
export function discardBackup(token: string) {
  return apiFetch<void>(`/api/backups/validate/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  }).catch(() => undefined)
}

/** The refusal a validation or restore carried, or null when the failure was not a refusal of the backup. */
export function refusalFrom(error: unknown): BackupRefusal | null {
  if (!(error instanceof ApiError) || typeof error.problem !== 'object' || error.problem === null) {
    return null
  }

  const problem = error.problem as { issues?: unknown; moreIssues?: unknown }

  if (!Array.isArray(problem.issues)) {
    return null
  }

  return {
    code: error.code,
    detail: error.message,
    issues: problem.issues.filter(
      (issue): issue is BackupIssue =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof (issue as BackupIssue).message === 'string',
    ),
    moreIssues: typeof problem.moreIssues === 'number' ? problem.moreIssues : 0,
  }
}
