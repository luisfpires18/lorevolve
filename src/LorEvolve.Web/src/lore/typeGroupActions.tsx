import type { Dispatch, SetStateAction } from 'react'
import { t as translate, type useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import {
  createEntityTypeGroup,
  deleteEntityTypeGroup,
  renameEntityTypeGroup,
  reorderEntityTypeGroups,
} from './typesApi'
import type { EntityTypeGroup } from './typeDefinitions'

/** The groups tab's helpers and handlers: who is in a group, rename, delete, create and move. */
export function typeGroupActions({
  universeId,
  onGroupsChanged,
  t,
  tn,
  tx,
  newName,
  setNewName,
  setNewError,
  setRenaming,
  draft,
  busy,
  setBusy,
  setProblem,
  setMoving,
  groups,
  typeName,
}: {
  universeId: string
  onGroupsChanged: () => Promise<void>
  newName: string
  setNewName: Dispatch<SetStateAction<string>>
  setNewError: Dispatch<SetStateAction<string | null>>
  setRenaming: Dispatch<SetStateAction<string | null>>
  draft: string
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  setProblem: Dispatch<
    SetStateAction<{
      groupId: string
      text: string
      fields: string[]
    } | null>
  >
  setMoving: Dispatch<SetStateAction<EntityTypeGroup[] | null>>
  groups: EntityTypeGroup[]
  typeName: Map<string, string>
} & Pick<ReturnType<typeof useI18n>, 't' | 'tn' | 'tx'>) {
  function membersOf(group: EntityTypeGroup) {
    return group.typeIds.map((id) => typeName.get(id)).filter((name): name is string => !!name)
  }

  function usedBy(group: EntityTypeGroup) {
    const names = membersOf(group)
    if (names.length === 0) return t('entityTypes.groupsPanel.usedByNone')
    return tn('entityTypes.groupsPanel.usedBy', names.length, {
      name: names[0],
      names: names.join(', '),
    })
  }

  async function rename(group: EntityTypeGroup) {
    const name = draft.trim()
    if (!name || busy) return
    if (name === group.name) {
      setRenaming(null)
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await renameEntityTypeGroup(universeId, group.id, name)
      setRenaming(null)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: group.id,
        text:
          error instanceof ApiError
            ? (error.fieldErrors.name ?? error.message)
            : t('entityTypes.groupsPanel.renameFailed'),
        fields: [],
      })
    } finally {
      setBusy(false)
    }
  }

  async function remove(group: EntityTypeGroup) {
    if (busy) return
    const names = membersOf(group)
    const effect =
      names.length === 0
        ? t('entityTypes.groupsPanel.usedByNone')
        : t('entityTypes.groupsPanel.deleteEffect', { names: names.join(', ') })
    if (
      !(await confirmAction({
        title: <>{tx('entityTypes.groupsPanel.deleteTitle', { name: <bdi>{group.name}</bdi> })}</>,
        message: t('entityTypes.groupsPanel.deleteMessage', { effect }),
        confirmLabel: t('entityTypes.groupsPanel.deleteConfirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      await deleteEntityTypeGroup(universeId, group.id)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: group.id,
        text: error instanceof ApiError ? error.message : t('entityTypes.groupsPanel.deleteFailed'),
        fields: fieldsOf(error),
      })
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    setNewError(null)
    try {
      await createEntityTypeGroup(universeId, name)
      setNewName('')
      await onGroupsChanged()
    } catch (error: unknown) {
      setNewError(
        error instanceof ApiError
          ? (error.fieldErrors.name ?? error.message)
          : t('entityTypes.groupsPanel.createFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  /** One step up or down: the whole order is sent, as every other order in LorEvolve is. */
  async function move(index: number, by: -1 | 1) {
    if (busy) return
    const order = groups.map((group) => group.id)
    const [moved] = order.splice(index, 1)
    order.splice(index + by, 0, moved)
    const byId = new Map(groups.map((group) => [group.id, group]))
    setMoving(order.map((id) => byId.get(id)!))
    setBusy(true)
    setProblem(null)
    try {
      await reorderEntityTypeGroups(universeId, order)
      await onGroupsChanged()
    } catch (error: unknown) {
      setProblem({
        groupId: moved,
        text: error instanceof ApiError ? error.message : t('entityTypes.groupsPanel.moveFailed'),
        fields: [],
      })
      // Back to the order the server holds, which another tab may have changed meanwhile.
      await onGroupsChanged().catch(() => undefined)
    } finally {
      setMoving(null)
      setBusy(false)
    }
  }

  return { membersOf, usedBy, rename, remove, create, move }
}

/** The fields a refused delete names, as "Field on Type", from the problem's own list. */
function fieldsOf(error: unknown): string[] {
  if (!(error instanceof ApiError)) return []
  const fields = (error.problem as { fields?: { fieldName?: string; typeName?: string }[] } | null)
    ?.fields
  return Array.isArray(fields)
    ? fields.map((field) =>
        translate('entityTypes.groupsPanel.fieldOnType', {
          field: field.fieldName ?? '',
          type: field.typeName ?? '',
        }),
      )
    : []
}
