import { apiFetch } from '../lib/api'
import type { UniverseRoleValue } from '../universes/types'

/** Where a universe's MCP server is (ADR 0046). Null when connecting AI apps is not set up on this LoreX. */
export interface McpConnectInfo {
  mcpUrl: string | null
}

/** What the consent screen shows about a request: the app as it claims to be, and the universe it asks for. */
export interface ConnectionRequestDetails {
  clientName: string
  /** The host that published the app's details (a client metadata document). Null: nothing vouches for the app. */
  verifiedHost: string | null
  redirectHost: string
  /** Every address the app may return to is on this device. */
  loopbackOnly: boolean
  universeId: string
  universeName: string
  role: UniverseRoleValue
}

/** Mirrors the backend enum, sent as its number like every enum this API sends. */
export const ConnectedAppStatus = {
  Active: 0,
  NoAccess: 1,
  Expired: 2,
} as const

export type ConnectedAppStatusValue = (typeof ConnectedAppStatus)[keyof typeof ConnectedAppStatus]

/** One of the account's own connections. Never a token or a secret. */
export interface ConnectedApp {
  id: string
  clientName: string
  verifiedHost: string | null
  universeId: string
  universeName: string
  createdAt: string
  lastUsedAt: string | null
  status: ConnectedAppStatusValue
}

export function getMcpConnectInfo(universeId: string, signal?: AbortSignal) {
  return apiFetch<McpConnectInfo>(`/api/universes/${universeId}/mcp`, { signal })
}

/** The consent screen's read of the request it was handed, by the parameters that name the app, its return and the universe. */
export function describeConnectionRequest(params: URLSearchParams, signal?: AbortSignal) {
  const query = new URLSearchParams()
  for (const name of ['client_id', 'redirect_uri', 'resource']) {
    const value = params.get(name)
    if (value !== null) query.set(name, value)
  }
  return apiFetch<ConnectionRequestDetails>(
    `/api/oauth/authorization-request?${query.toString()}`,
    {
      signal,
    },
  )
}

/** The consent form's antiforgery field and token, for the signed-in account. Paired with an HttpOnly cookie. */
export interface ConsentToken {
  fieldName: string
  token: string
}

export function getConsentToken(signal?: AbortSignal) {
  return apiFetch<ConsentToken>('/api/oauth/consent-token', { signal })
}

export function listConnectedApps(signal?: AbortSignal) {
  return apiFetch<ConnectedApp[]>('/api/profile/connected-apps', { signal })
}

export function disconnectApp(connectionId: string) {
  return apiFetch<void>(`/api/profile/connected-apps/${connectionId}`, { method: 'DELETE' })
}

/** What the connection lets an app read, in the words the screens use. */
export const READABLE = [
  'Lore entries, with their fields, aliases and summaries',
  'Relationships between entries',
  'Stories, with their chapters and plot',
  'Scenes and their manuscripts',
  'The timeline',
] as const
