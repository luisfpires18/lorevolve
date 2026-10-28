import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { getProfileImage } from './api'
import { ProfileImageContext } from './profile-image-context'
import type { ProfileImageRef } from './types'

/**
 * One answer to "what does this account's avatar look like", for everything that draws one.
 *
 * Four places show it - the workspace rail, the folded mobile bar, the universes header and the
 * Profile screen - and they must never disagree. Fetching in each would mean four requests for
 * one small row and, worse, three stale circles after an upload: the screen that did the writing
 * would update and the chrome around it would not.
 *
 * A provider of its own rather than another field on the auth context, because it is media and
 * not identity: it is read from a different feature's endpoint, it changes while the session does
 * not, and `AuthProvider` should not grow a dependency on the media surface to hold it. What it
 * does take from auth is when to read and when to forget - it follows the signed-in account and
 * nothing else, so signing out cannot leave one person's photo on screen for the next.
 *
 * Every write path reports its result through `changed`, so the avatar updates from the response
 * that was already received rather than from a second read of the same row.
 */
export function ProfileImageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  // What is held, and whose. Keeping the account id beside the photo is what makes signing out
  // and signing in as someone else fall out of the render: state that belongs to another account
  // simply is not this one's, so nothing has to clear it and no effect has to notice.
  const [held, setHeld] = useState<{ forUser: string; image: ProfileImageRef | null } | null>(null)

  const settled = held !== null && held.forUser === userId
  const image = settled ? held.image : null
  const isLoading = userId !== null && !settled

  useEffect(() => {
    if (!userId) return

    const controller = new AbortController()

    // A photo that cannot be read leaves the monogram standing, which is what an account with no
    // photo shows anyway. Nothing here is worth failing a screen over.
    getProfileImage(controller.signal)
      .then((current) => {
        if (!controller.signal.aborted) setHeld({ forUser: userId, image: current })
      })
      .catch(() => {
        if (!controller.signal.aborted) setHeld({ forUser: userId, image: null })
      })

    return () => {
      controller.abort()
    }
  }, [userId])

  const changed = useCallback(
    (next: ProfileImageRef | null) => {
      if (userId) setHeld({ forUser: userId, image: next })
    },
    [userId],
  )

  const value = useMemo(() => ({ image, isLoading, changed }), [image, isLoading, changed])

  return <ProfileImageContext.Provider value={value}>{children}</ProfileImageContext.Provider>
}
