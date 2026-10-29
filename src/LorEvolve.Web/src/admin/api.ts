import { apiFetch } from '../lib/api'

/** The Admin workspace's API (#40). Every call is refused by the server for anyone but an Admin. */

export interface AdminUserSummary {
  id: string
  username: string
  publicDisplayName: string | null
  role: 'Member' | 'Admin'
  isBlocked: boolean
}

export interface AdminUserPage {
  items: AdminUserSummary[]
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export interface AdminAuditEntry {
  id: string
  action: 'Block' | 'Unblock' | 'PasswordResetSent'
  reason: string
  createdAt: string
  actorUserId: string
  actorUsername: string | null
}

export interface AdminUserDetail extends AdminUserSummary {
  blockedAt: string | null
  ownedUniverses: number
  sharedUniverses: number
  storageUsedBytes: number
  storageQuotaBytes: number
  connectedApps: number
  history: AdminAuditEntry[]
}

export interface MonthCount {
  year: number
  month: number
  count: number
}

export interface AdminOverview {
  generatedAt: string
  accounts: number
  admins: number
  blockedAccounts: number
  universes: number
  publicUniverses: number
  collaborations: number
  storedImageBytes: number
  connectedApps: number
  universesCreatedByMonth: MonthCount[]
}

export function getOverview(signal?: AbortSignal) {
  return apiFetch<AdminOverview>('/api/admin/overview', { signal })
}

export function listUsers(input: { search: string; page: number }, signal?: AbortSignal) {
  const query = new URLSearchParams({ page: String(input.page) })
  if (input.search.trim()) query.set('search', input.search.trim())
  return apiFetch<AdminUserPage>(`/api/admin/users?${query}`, { signal })
}

export function getUser(userId: string, signal?: AbortSignal) {
  return apiFetch<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(userId)}`, { signal })
}

export function setBlocked(userId: string, block: boolean, reason: string) {
  return apiFetch<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(userId)}/${block ? 'block' : 'unblock'}`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  )
}

/** Emails the account its own password reset link (#69). Neither its address nor the link comes back here. */
export function emailPasswordReset(userId: string) {
  return apiFetch<AdminUserDetail>(
    `/api/admin/users/${encodeURIComponent(userId)}/password-reset-email`,
    { method: 'POST' },
  )
}

/** A sign-up link for one address while registration is invitation-only: put in `/register?invite=`, 7 days. */
export function createSignUpLink(email: string) {
  return apiFetch<{ token: string; expiresAt: string }>('/api/admin/signup-links', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** The same sign-up link, emailed to that address by LorEvolve. The link itself never comes back here. */
export function emailSignUpLink(email: string) {
  return apiFetch<{ expiresAt: string }>('/api/admin/signup-links/email', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

/** Database backups to R2 (#54, ADR 0064): what is off the host, and the last attempt. */
export interface VerifiedBackup {
  key: string
  createdAt: string
  bytes: number
  sha256: string
  schemaVersion: string | null
}

export interface BackupAttempt {
  trigger: string
  startedAt: string
  finishedAt: string | null
  outcome: 'Running' | 'Succeeded' | 'Failed'
  error: string | null
  key: string | null
}

export interface DatabaseBackupStatus {
  enabled: boolean
  automatic: boolean
  environment: string | null
  store: string | null
  problem: string | null
  running: boolean
  lastAttempt: BackupAttempt | null
  consecutiveFailures: number
  lastVerified: VerifiedBackup | null
  lastVerifiedAgeHours: number | null
  stale: boolean
  verifiedCount: number
  storedBytes: number
  intervalHours: number
  pruneEnabled: boolean
  lastPruned: number | null
  checkedAt: string | null
}

export function getDatabaseBackups(signal?: AbortSignal) {
  return apiFetch<DatabaseBackupStatus>('/api/admin/database-backups', { signal })
}

export function runDatabaseBackup() {
  return apiFetch<DatabaseBackupStatus>('/api/admin/database-backups/run', { method: 'POST' })
}
