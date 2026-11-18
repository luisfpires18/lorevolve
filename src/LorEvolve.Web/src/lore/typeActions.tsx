import type { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { deleteEntityType, listEntityTypeGroups, moveEntityType } from './typesApi'
import type { EntityType } from './typeDefinitions'
import { inUseDetail, targetedDetail } from './typeDeleteDetail'
import type { typeSiblings } from './typeSiblings'
import type { useTypesState } from './useTypesState'
import type { useWorkspaceTypes } from '../pages/useWorkspaceTypes'

/** The Types screen's handlers: say a failure, read again, move a type, delete it, and add a child to it. */
export function typeActions({
  universe,
  setTypes,
  setGroups,
  refreshTypes,
  t,
  tx,
  types,
  setMessage,
  setEditing,
  setChildOf,
  openTypeId,
  setOpenTypeId,
  setBlocked,
  setNotice,
  tree,
  moving,
  setMoving,
  refocus,
  siblingsOf,
}: ReturnType<typeof useTypesState> &
  Pick<
    ReturnType<typeof useWorkspaceTypes>,
    'universe' | 'setTypes' | 'setGroups' | 'refreshTypes'
  > &
  Pick<ReturnType<typeof typeSiblings>, 'siblingsOf'> &
  Pick<ReturnType<typeof useI18n>, 't' | 'tx'>) {
  function report(error: unknown, fallback: string) {
    setMessage(error instanceof ApiError ? error.message : fallback)
  }

  function refresh() {
    return refreshTypes()
  }

  async function refreshGroups() {
    setGroups(await listEntityTypeGroups(universe.id))
  }

  /** One place up or down among the type's own siblings; the list comes back from the move itself. */
  async function move(type: EntityType, direction: 'up' | 'down') {
    if (moving || !types) return
    // Shown at once by swapping places with the neighbour; the server's list replaces it, or the snapshot comes back.
    const previous = types
    const node = tree.byId.get(type.id)
    const siblings = node ? siblingsOf(node) : []
    const neighbour = siblings[siblings.indexOf(node!) + (direction === 'up' ? -1 : 1)]?.type
    if (neighbour) {
      setTypes(
        previous.map((each) =>
          each.id === type.id
            ? { ...each, displayOrder: neighbour.displayOrder }
            : each.id === neighbour.id
              ? { ...each, displayOrder: type.displayOrder }
              : each,
        ),
      )
    }
    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const moved = await moveEntityType(universe.id, type.id, direction)
      refocus.current = `${type.id}:${direction}`
      setTypes(moved)
      setNotice(
        direction === 'up'
          ? t('entityTypes.page.movedUp', { name: type.name })
          : t('entityTypes.page.movedDown', { name: type.name }),
      )
    } catch (error: unknown) {
      setTypes(previous)
      report(error, t('entityTypes.page.moveFailed'))
    } finally {
      setMoving(null)
    }
  }

  /**
   * Deleting a type. A type any entry still uses - in Lore or in the Trash, since an entry there keeps its type - is not
   * offered a confirmation it could only fail: the author is told, under the type, exactly what uses it and where to
   * go. An unused type asks once, as every irreversible action in LorEvolve does, and is gone.
   */
  async function removeType(type: EntityType) {
    setMessage(null)
    setNotice(null)
    setBlocked(null)

    // Nested types hold it too: never deleted with it, never promoted or moved somewhere the author did not choose.
    const children = tree.byId.get(type.id)?.children.length ?? 0
    if (type.entityCount > 0 || children > 0) {
      setBlocked({
        typeId: type.id,
        text: inUseDetail(
          type.name,
          type.entityCount - type.trashedEntityCount,
          type.trashedEntityCount,
          children,
        ),
      })
      return
    }

    // A link field on another type limited to this one - archived ones too, which keep their limit - is the same refusal the
    // API gives, said before asking.
    const targeting = (types ?? []).flatMap((owner) =>
      owner.id === type.id
        ? []
        : [...owner.fields, ...(owner.archivedFields ?? [])]
            .filter((field) => field.targetEntityTypeId === type.id)
            .map((field) => ({
              field: field.name,
              archived: field.archivedAt !== null,
              owner: owner.name,
            })),
    )
    if (targeting.length > 0) {
      setBlocked({ typeId: type.id, text: targetedDetail(type.name, targeting) })
      return
    }

    if (
      !(await confirmAction({
        title: <>{tx('entityTypes.page.deleteTitle', { name: <bdi>{type.name}</bdi> })}</>,
        message: t('entityTypes.page.deleteMessage'),
        confirmLabel: t('entityTypes.page.deleteConfirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }

    try {
      await deleteEntityType(universe.id, type.id)
      setNotice(t('entityTypes.page.deleted', { name: type.name }))
      if (openTypeId === type.id) setOpenTypeId(null)
      await refresh()
    } catch (error: unknown) {
      // Used since the list was read - another tab, or the entry form - so the API's count is the true one.
      if (error instanceof ApiError && error.status === 409) {
        setBlocked({ typeId: type.id, text: error.message })
        await refresh().catch(() => undefined)
      } else {
        report(error, t('entityTypes.page.deleteFailed'))
      }
    }
  }

  function openChild(parent: EntityType) {
    setBlocked(null)
    setChildOf(parent)
    setEditing('new')
  }

  return { report, refresh, refreshGroups, move, removeType, openChild }
}
