import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { getWorkspaceLink, type WorkspaceLink } from './api'

/**
 * Whether the person reading a public page is its owner, and if so where they edit it (Task 011) - asked only when
 * someone is signed in, of the one owner-scoped route that answers only its owner. Anyone else, and every anonymous
 * visitor, gets null: no public response ever says who owns a world.
 */
export function useWorkspaceLink(world: string, child: { lore?: string; story?: string } = {}) {
  const { user } = useAuth()
  const key = `${user?.id ?? ''}|${world}|${child.lore ?? ''}|${child.story ?? ''}`
  const [found, setFound] = useState<{ key: string; link: WorkspaceLink } | null>(null)

  useEffect(() => {
    if (!user || !world) return
    const controller = new AbortController()
    getWorkspaceLink(world, { lore: child.lore, story: child.story }, controller.signal)
      .then((link) => setFound({ key, link }))
      .catch(() => {
        /* Not theirs, or not reachable: the page simply has no owner action. */
      })
    return () => {
      controller.abort()
    }
  }, [user, world, child.lore, child.story, key])

  return found?.key === key ? found.link : null
}
