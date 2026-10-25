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
  action: 'Block' | 'Unblock'
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
