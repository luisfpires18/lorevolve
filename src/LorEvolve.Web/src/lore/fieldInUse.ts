import { tn as translateN } from '../i18n'

export function entries(count: number) {
  return translateN('entityTypes.fields.entries', count, { n: count })
}

/** Why a field holding values cannot be deleted: the sentence the API's refusal carries (`FieldInUseDetail`). */
export function fieldInUseDetail(entryCount: number, trashed: number) {
  if (trashed === 0) return translateN('entityTypes.fields.inUse', entryCount, { n: entryCount })
  if (trashed === entryCount)
    return translateN('entityTypes.fields.inUseAllTrashed', entryCount, { n: entryCount })
  return translateN('entityTypes.fields.inUseSomeTrashed', entryCount, { n: entryCount, trashed })
}
