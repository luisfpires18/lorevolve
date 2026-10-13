import { createContext, useContext } from 'react'
import { UniverseRole, type UniverseRoleValue } from './types'

/**
 * What the signed-in account may do in one universe, for PRESENTATION ONLY (ADR 0041 amendment).
 *
 * These mirror the API's capabilities so a Viewer is not shown an Edit button that can only answer 403. They are not
 * security: the API decides every request on its own, and a control shown by mistake here is still refused there.
 * Components ask a named capability - never compare roles - so a role gains one (a Reviewer commenting) without
 * anything else changing.
 */
export interface UniverseCapabilities {
  /** Create and edit creative content, its types and media; run Canon. */
  editContent: boolean
  /** Move to the Trash, open it and restore from it. */
  manageTrash: boolean
  /** Read saved versions and restore one. */
  manageHistory: boolean
  /** Erase from the Trash for good. */
  permanentlyDelete: boolean
  /** Rename, colour, archive, delete: Settings. */
  manageUniverse: boolean
  /** Everything on Publish, and every public toggle. */
  publish: boolean
  /** Download a backup. */
  backup: boolean
  /** Invite people and manage their roles. */
  manageCollaborators: boolean
  /** Start review threads and reply to them. Every member reads them. */
  comment: boolean
  /** Resolve and reopen review threads. */
  resolveComments: boolean
  /**
   * Keep account ideas about this universe. Not an API capability but a consequence of one: an idea may point only into
   * a universe its author owns (ADR 0030 amendment), so a collaborator has nothing to keep here.
   */
  keepIdeas: boolean
}

const NONE: UniverseCapabilities = {
  editContent: false,
  manageTrash: false,
  manageHistory: false,
  permanentlyDelete: false,
  manageUniverse: false,
  publish: false,
  backup: false,
  manageCollaborators: false,
  comment: false,
  resolveComments: false,
  keepIdeas: false,
}

/** The whole presentation matrix, one role at a time. */
export function capabilitiesOf(role: UniverseRoleValue): UniverseCapabilities {
  switch (role) {
    case UniverseRole.Owner:
      return {
        editContent: true,
        manageTrash: true,
        manageHistory: true,
        permanentlyDelete: true,
        manageUniverse: true,
        publish: true,
        backup: true,
        manageCollaborators: true,
        comment: true,
        resolveComments: true,
        keepIdeas: true,
      }
    case UniverseRole.Editor:
      return {
        ...NONE,
        editContent: true,
        manageTrash: true,
        manageHistory: true,
        comment: true,
        resolveComments: true,
      }
    case UniverseRole.Reviewer:
      return { ...NONE, comment: true }
    case UniverseRole.Viewer:
      return NONE
    default:
      return NONE
  }
}

export const canEditContent = (role: UniverseRoleValue) => capabilitiesOf(role).editContent
export const canManageTrash = (role: UniverseRoleValue) => capabilitiesOf(role).manageTrash
export const canManageHistory = (role: UniverseRoleValue) => capabilitiesOf(role).manageHistory
export const canPermanentlyDelete = (role: UniverseRoleValue) =>
  capabilitiesOf(role).permanentlyDelete
export const canManageUniverse = (role: UniverseRoleValue) => capabilitiesOf(role).manageUniverse
export const canPublish = (role: UniverseRoleValue) => capabilitiesOf(role).publish
export const canBackup = (role: UniverseRoleValue) => capabilitiesOf(role).backup
export const canManageCollaborators = (role: UniverseRoleValue) =>
  capabilitiesOf(role).manageCollaborators

/**
 * The open universe's capabilities, provided by its workspace. Outside a universe the default is the owner's, which is
 * what every screen did before collaboration - nothing outside a universe is role-dependent.
 */
export const UniverseAccessContext = createContext<UniverseCapabilities>(
  capabilitiesOf(UniverseRole.Owner),
)

export function useUniverseAccess() {
  return useContext(UniverseAccessContext)
}

/** The roles a collaborator can hold, in the order a picker offers them. */
export const COLLABORATOR_ROLES = [
  UniverseRole.Editor,
  UniverseRole.Reviewer,
  UniverseRole.Viewer,
] as const

export const ROLE_LABELS: Record<UniverseRoleValue, string> = {
  [UniverseRole.Owner]: 'Owner',
  [UniverseRole.Editor]: 'Editor',
  [UniverseRole.Reviewer]: 'Reviewer',
  [UniverseRole.Viewer]: 'Viewer',
}

/** One line per role, beside the picker. Nothing promised that does not exist. */
export const ROLE_DESCRIPTIONS: Record<UniverseRoleValue, string> = {
  [UniverseRole.Owner]: 'Owns this universe.',
  [UniverseRole.Editor]:
    'Can create and edit content, use Trash and restore items. Cannot permanently delete, publish, or manage the universe.',
  [UniverseRole.Reviewer]: 'Can read and comment. Cannot edit content.',
  [UniverseRole.Viewer]: 'Can read the shared universe.',
}
