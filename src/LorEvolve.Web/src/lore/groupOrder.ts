/** What a group priority needs of a group: its member types. Groups come in their priority, first first. */
interface RankedGroup {
  typeIds: string[]
}

/**
 * Lore in the author's group priority: each entry under the first-ranked group its type is in, entries of types in no
 * group last. Stable, so inside one group the entries keep the order they came in (a scene's: the order they were picked).
 */
export function byGroupPriority<T extends { entityTypeId: string }>(
  items: readonly T[],
  groups: readonly RankedGroup[],
): T[] {
  const rank = new Map<string, number>()
  groups.forEach((group, index) => {
    for (const typeId of group.typeIds) if (!rank.has(typeId)) rank.set(typeId, index)
  })
  const of = (item: T) => rank.get(item.entityTypeId) ?? groups.length
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => of(a.item) - of(b.item) || a.index - b.index)
    .map(({ item }) => item)
}
