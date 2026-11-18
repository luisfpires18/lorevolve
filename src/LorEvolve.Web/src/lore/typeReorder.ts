import type { KeyboardEvent } from 'react'
import type { DragMoveEvent } from '@dnd-kit/core'
import type { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { reorderEntityType } from './typesApi'
import type { EntityType } from './typeDefinitions'
import type { TypeNode } from './typeTree'
import type { typeActions } from './typeActions'
import type { typeSiblings } from './typeSiblings'
import type { useTypesState } from './useTypesState'
import type { useWorkspaceTypes } from '../pages/useWorkspaceTypes'

/** Reordering by the grip: where a pointer points, a drag's move, the reorder itself, and the grip from the keyboard. */
export function typeReorder({
  universe,
  setTypes,
  t,
  types,
  setMessage,
  setNotice,
  tree,
  moving,
  setMoving,
  refocus,
  lifted,
  setLifted,
  target,
  setTarget,
  siblingsOf,
  lastOf,
  report,
  refresh,
}: ReturnType<typeof useTypesState> &
  Pick<ReturnType<typeof useWorkspaceTypes>, 'universe' | 'setTypes'> &
  ReturnType<typeof typeSiblings> &
  Pick<ReturnType<typeof typeActions>, 'report' | 'refresh'> &
  Pick<ReturnType<typeof useI18n>, 't'>) {
  /**
   * Which sibling's place a pointer at `y` points to: the sibling whose whole branch - its row and every row nested under it
   * - holds `y`, or the nearest one. Only siblings are ever candidates, so a drop can never land inside another branch or
   * under another parent, however far the pointer drifts.
   */
  function placeAt(node: TypeNode, y: number) {
    const siblings = siblingsOf(node)
    let best = siblings.indexOf(node)
    let distance = Number.POSITIVE_INFINITY
    siblings.forEach((sibling, index) => {
      const top = rowOf(sibling.type.id)?.getBoundingClientRect().top
      const bottom = rowOf(lastOf(sibling).type.id)?.getBoundingClientRect().bottom
      if (top === undefined || bottom === undefined) return
      const away = y < top ? top - y : y > bottom ? y - bottom : 0
      if (away < distance) {
        distance = away
        best = index
      }
    })
    return best
  }

  function rowOf(typeId: string) {
    return document.querySelector<HTMLElement>(`.types__row[data-type-id="${typeId}"]`)
  }

  function onDragMove(event: DragMoveEvent) {
    const node = tree.byId.get(String(event.active.id))
    const start = event.activatorEvent as MouseEvent
    if (!node || typeof start.clientY !== 'number') return
    const next = placeAt(node, start.clientY + event.delta.y)
    if (next !== target) setTarget(next)
  }

  /**
   * Puts a type at `to` among its siblings: the list shows it there at once, one request makes it so, and the server's list
   * replaces the guess. A refusal puts the order back as it was and says why; a type that has moved since this screen read
   * the list reloads it.
   */
  async function reorder(type: EntityType, to: number) {
    const node = tree.byId.get(type.id)
    if (!node || moving || !types) return
    const siblings = siblingsOf(node)
    const from = siblings.indexOf(node)
    if (to === from || to < 0 || to >= siblings.length) return

    const previous = types
    const order = siblings.map((sibling) => sibling.type.id)
    order.splice(from, 1)
    order.splice(to, 0, type.id)
    const place = new Map(order.map((id, index) => [id, index + 1]))
    setTypes(
      previous.map((each) =>
        place.has(each.id) ? { ...each, displayOrder: place.get(each.id)! } : each,
      ),
    )

    setMessage(null)
    setNotice(null)
    setMoving(type.id)
    try {
      const reordered = await reorderEntityType(universe.id, type.id, to, type.parentId)
      refocus.current = `${type.id}:handle`
      setTypes(reordered)
      setNotice(
        t('entityTypes.page.movedToPlace', {
          name: type.name,
          place: to + 1,
          total: siblings.length,
        }),
      )
    } catch (error: unknown) {
      setTypes(previous)
      refocus.current = `${type.id}:handle`
      report(error, t('entityTypes.page.moveFailed'))
      if (error instanceof ApiError && error.status === 409) await refresh().catch(() => undefined)
    } finally {
      setMoving(null)
    }
  }

  /** The grip from the keyboard: Space or Enter lifts and drops, the arrows move among siblings, Escape puts it back. */
  function onHandleKey(type: EntityType, event: KeyboardEvent<HTMLButtonElement>) {
    const node = tree.byId.get(type.id)
    if (!node) return
    const siblings = siblingsOf(node)
    const from = siblings.indexOf(node)
    const isLifted = lifted === type.id
    // Alone among its siblings, there is nowhere for it to go.
    if (siblings.length < 2) return
    const total = siblings.length

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      if (moving) return
      if (!isLifted) {
        setLifted(type.id)
        setTarget(from)
        setNotice(t('entityTypes.page.lifted', { name: type.name, place: from + 1, total }))
      } else {
        const to = target ?? from
        setLifted(null)
        setTarget(null)
        if (to === from)
          setNotice(t('entityTypes.page.stays', { name: type.name, place: from + 1, total }))
        else void reorder(type, to)
      }
    } else if (isLifted && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const to = Math.min(
        siblings.length - 1,
        Math.max(0, (target ?? from) + (event.key === 'ArrowUp' ? -1 : 1)),
      )
      setTarget(to)
      setNotice(t('entityTypes.page.carriedAt', { name: type.name, place: to + 1, total }))
    } else if (isLifted && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setLifted(null)
      setTarget(null)
      setNotice(t('entityTypes.page.putBack', { name: type.name, place: from + 1, total }))
    }
  }

  return { placeAt, rowOf, onDragMove, reorder, onHandleKey }
}
