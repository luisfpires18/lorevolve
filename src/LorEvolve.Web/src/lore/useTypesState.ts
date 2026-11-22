import { useEffect, useMemo, useRef, useState } from 'react'
import { MouseSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { useI18n } from '../i18n'
import type { EntityType, EntityTypeGroup } from './typeDefinitions'
import { buildTypeTree } from './typeTree'
import type { useWorkspaceTypes } from '../pages/useWorkspaceTypes'

/** Groups not read: none to offer, one stable list. */
const NO_GROUPS: EntityTypeGroup[] = []

/** Every state and ref of the Types screen's Lore list: the types, the editor, the notices, moves and the drag. */
export function useTypesState({
  typesRead,
  groupsRead,
  t,
}: {
  typesRead: ReturnType<typeof useWorkspaceTypes>['types']
  groupsRead: ReturnType<typeof useWorkspaceTypes>['groups']
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  const types = Array.isArray(typesRead) ? typesRead : null
  // Groups are an extra: without them the types still work, and the group controls simply have none to offer.
  const groups = Array.isArray(groupsRead) ? groupsRead : NO_GROUPS
  const [reported, setMessage] = useState<string | null>(null)
  const message = reported ?? (typesRead === 'failed' ? t('entityTypes.page.loadFailed') : null)
  // The type editor: a new type, or the existing one being edited. One drawer for both. A new type opened from a row's
  // Add child starts inside that row's type.
  const [editing, setEditing] = useState<EntityType | 'new' | null>(null)
  const [childOf, setChildOf] = useState<EntityType | null>(null)
  const [openTypeId, setOpenTypeId] = useState<string | null>(null)
  // Why one type cannot be deleted, said under it: counted from the list, or the API's own words if it refused.
  const [blocked, setBlocked] = useState<{ typeId: string; text: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const tree = useMemo(() => buildTypeTree(types ?? []), [types])
  // One move at a time; the button that asked keeps the focus once its row has moved (React moves the row's node, which
  // a browser does not keep focused on its own).
  const [moving, setMoving] = useState<string | null>(null)
  const moveButtons = useRef(new Map<string, HTMLButtonElement>())
  const refocus = useRef<string | null>(null)

  useEffect(() => {
    if (!refocus.current) return
    moveButtons.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [types])

  // Reordering by the grip (wide screens). `target` is where the type being carried would land among its siblings - from a
  // mouse drag or from the keyboard - and is drawn as a line at that place; `lifted` is a keyboard carry in progress.
  const [dragId, setDragId] = useState<string | null>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [target, setTarget] = useState<number | null>(null)
  // A mouse only, and only after it has moved a little: a click on the grip is not a drag, and a finger never is one.
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }))

  return {
    types,
    groups,
    reported,
    setMessage,
    message,
    editing,
    setEditing,
    childOf,
    setChildOf,
    openTypeId,
    setOpenTypeId,
    blocked,
    setBlocked,
    notice,
    setNotice,
    tree,
    moving,
    setMoving,
    moveButtons,
    refocus,
    dragId,
    setDragId,
    lifted,
    setLifted,
    target,
    setTarget,
    sensors,
  }
}
