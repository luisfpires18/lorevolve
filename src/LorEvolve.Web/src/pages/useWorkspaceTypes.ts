import { useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { withInheritedFields } from '../lore/fieldInheritance'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * The workspace's types for a screen that uses them. The read that opened the universe serves the first such screen;
 * every later one reads them again as it opens, showing the copy it has meanwhile - a type's entry counts move as entries
 * are written, so a copy from an earlier screen is shown, never trusted.
 *
 * `entryTypes` are the same types as an entry of each is edited, shown and filtered: with the fields it inherits from the
 * types above it (ADR 0007 amendment, 2026-11-12). `types` stay each type's own, for the Types screen that edits them.
 */
export function useWorkspaceTypes() {
  const context = useOutletContext<WorkspaceContext>()
  const { revalidateTypes, types } = context
  useEffect(() => {
    revalidateTypes()
  }, [revalidateTypes])
  const entryTypes = useMemo(
    () => (Array.isArray(types) ? types.map((type) => withInheritedFields(type, types)) : types),
    [types],
  )
  return { ...context, entryTypes }
}
