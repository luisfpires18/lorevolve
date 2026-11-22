import { useContext, useEffect, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { EntryTypesContext } from '../lore/entrySource'
import { withInheritedFields } from '../lore/fieldInheritance'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * The workspace's types for a screen that uses them. The read that opened the universe serves the first such screen;
 * every later one reads them again as it opens, showing the copy it has meanwhile - a type's entry counts move as entries
 * are written, so a copy from an earlier screen is shown, never trusted.
 *
 * `entryTypes` are the same types as an entry of each is edited, shown and filtered: with the fields it inherits from the
 * types above it (ADR 0007 amendment, 2026-11-12). `types` stay each type's own, for the Types screen that edits them.
 *
 * A screen that mounts another source's types (`EntryTypesContext`, #551) reads those instead, and the universe's are
 * not read again for it.
 */
export function useWorkspaceTypes() {
  const context = useOutletContext<WorkspaceContext>()
  const mounted = useContext(EntryTypesContext)
  const own = mounted === null
  const { revalidateTypes, types } = context
  useEffect(() => {
    if (own) revalidateTypes()
  }, [revalidateTypes, own])
  const entryTypes = useMemo(
    () => (Array.isArray(types) ? types.map((type) => withInheritedFields(type, types)) : types),
    [types],
  )
  return mounted ? { ...context, ...mounted } : { ...context, entryTypes }
}
