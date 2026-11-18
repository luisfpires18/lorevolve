import { ChangeAction, ChangeResource, ChangeStatus, type Change } from './types'
import { t } from '../i18n'

const ACTION_KEYS = {
  [ChangeAction.Create]: 'review.aiChange.item.action.create',
  [ChangeAction.Update]: 'review.aiChange.item.action.update',
  [ChangeAction.Remove]: 'review.aiChange.item.action.remove',
  [ChangeAction.Reorder]: 'review.aiChange.item.action.reorder',
} as const

/** A field is archived, not trashed: it keeps its values and comes back from Types. */
export const actionWords = (change: Change) =>
  change.resource === ChangeResource.LoreField && change.action === ChangeAction.Remove
    ? t('review.aiChange.item.action.archive')
    : t(ACTION_KEYS[change.action])

/** Prose changes - a scene's manuscript, an entry's article - are shown as prose, never as before-and-after lines. */
export const isProse = (change: Change) =>
  change.resource === ChangeResource.Manuscript || change.resource === ChangeResource.Article

/** Changes that can be chosen for approval: waiting, with nothing wrong with them now. */
export function approvable(change: Change) {
  return change.status === ChangeStatus.Pending && change.issues.length === 0
}
