import { useCallback, useEffect, useLayoutEffect } from 'react'
import type { FamilyTree } from './types'
import type { useFamilyTreeViewState } from './useFamilyTreeViewState'
import { drawEdges } from './drawEdges'

export function useFamilyTreeLines({
  tree,
  layout,
  pointed,
  canvas,
  cards,
  setEdges,
  setSize,
}: ReturnType<typeof useFamilyTreeViewState> & { tree: FamilyTree }) {
  const measure = useCallback(() => {
    const root = canvas.current
    if (!root) return

    const drawn = drawEdges({ root, cards, layout, tree, pointed })
    setEdges(drawn)
    setSize({ width: root.scrollWidth, height: root.scrollHeight })
  }, [tree, layout, pointed])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const root = canvas.current
    if (!root || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => measure())
    observer.observe(root)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [measure])
}
