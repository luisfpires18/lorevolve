import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * The workspace's types for a screen that uses them. The read that opened the universe serves the first such screen;
 * every later one reads them again as it opens, showing the copy it has meanwhile - a type's entry counts move as entries
 * are written, so a copy from an earlier screen is shown, never trusted.
 */
export function useWorkspaceTypes() {
  const context = useOutletContext<WorkspaceContext>()
  const { revalidateTypes } = context
  useEffect(() => {
    revalidateTypes()
  }, [revalidateTypes])
  return context
}
