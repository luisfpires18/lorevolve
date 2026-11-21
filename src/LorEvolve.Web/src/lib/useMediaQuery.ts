import { useSyncExternalStore } from 'react'

/**
 * Whether the screen matches a width query now, following resizes and rotations: the read `FamilyMemberDetails` and
 * `useWorkspaceNav` make of `matchMedia`, kept current. For a part that only folds where the layout folds, when the
 * shared layout rules give it no rule of its own.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
