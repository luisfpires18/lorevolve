import { t as translate, tn as translateN } from '../i18n'

/**
 * Why a type a link field is limited to cannot be deleted: the same sentence the API's refusal carries
 * (`EntityTypeEndpoints.DeleteAsync`), naming the first field by its type's and its own name and counting the rest.
 */
export function targetedDetail(
  name: string,
  targeting: { field: string; archived: boolean; owner: string }[],
) {
  const ordered = [...targeting].sort((a, b) =>
    a.owner === b.owner ? (a.field < b.field ? -1 : 1) : a.owner < b.owner ? -1 : 1,
  )
  const first = ordered[0]
  const others = ordered.length - 1
  const vars = { name, field: first.field, owner: first.owner, n: others }
  if (others === 0) {
    return translate(
      first.archived ? 'entityTypes.page.targetedNoneArchived' : 'entityTypes.page.targetedNone',
      vars,
    )
  }
  return translateN(
    first.archived ? 'entityTypes.page.targetedOthersArchived' : 'entityTypes.page.targetedOthers',
    others,
    vars,
  )
}

/**
 * Why a type cannot be deleted, in the author's terms. The same sentence the API's refusal carries
 * (`EntityTypeEndpoints.InUseDetail`), said from the list before anything is sent: an entry in the Trash is out of sight in
 * Lore and still keeps its type, so it is named.
 */
export function inUseDetail(name: string, live: number, trashed: number, children = 0) {
  if (live + trashed === 0) {
    return translateN('entityTypes.page.inUse.onlyNested', children, { name, n: children })
  }
  const total = live + trashed
  const nested = translateN('entityTypes.page.inUse.nested', children, { n: children })
  const vars = { name, n: total, trashed, nested }
  const reason =
    children === 0
      ? trashed === 0
        ? translateN('entityTypes.page.inUse.reasonNone', total, vars)
        : trashed === total
          ? translateN('entityTypes.page.inUse.reasonAll', total, vars)
          : translateN('entityTypes.page.inUse.reasonSome', total, vars)
      : trashed === 0
        ? translateN('entityTypes.page.inUse.reasonNestedNone', total, vars)
        : trashed === total
          ? translateN('entityTypes.page.inUse.reasonNestedAll', total, vars)
          : translateN('entityTypes.page.inUse.reasonNestedSome', total, vars)
  const fix = translate(
    total === 1
      ? trashed === 0
        ? 'entityTypes.page.inUse.fixOne'
        : 'entityTypes.page.inUse.fixOneTrashed'
      : trashed === 0
        ? 'entityTypes.page.inUse.fixMany'
        : 'entityTypes.page.inUse.fixManyTrashed',
  )
  return children === 0
    ? `${reason} ${fix}`
    : `${reason} ${fix} ${translateN('entityTypes.page.inUse.tail', children)}`
}
