import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, apiFetch, SESSION_ENDED } from '../lib/api'
import { AuthContext } from './auth-context'
import type { AuthUser } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUnreachable, setIsUnreachable] = useState(false)
  const [probe, setProbe] = useState(0)

  useEffect(() => {
    let active = true

    apiFetch<AuthUser>('/api/auth/me')
      .then((current) => {
        if (active) {
          setUser(current)
          setIsUnreachable(false)
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        // A 401 is the normal signed-out case. Anything else (offline, a 500) says nothing about the session, so it is
        // not treated as signed out: the guards offer a retry instead of throwing the author out to the sign-in page.
        setIsUnreachable(!(error instanceof ApiError && error.status === 401))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [probe])

  useEffect(() => {
    const ended = () => setUser(null)
    window.addEventListener(SESSION_ENDED, ended)
    return () => window.removeEventListener(SESSION_ENDED, ended)
  }, [])

  const retry = useCallback(() => {
    setIsLoading(true)
    setProbe((count) => count + 1)
  }, [])

  const register = useCallback(
    async (input: { username: string; email: string; password: string; inviteToken?: string }) => {
      setUser(
        await apiFetch<AuthUser>('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
      )
    },
    [],
  )

  const logIn = useCallback(async (input: { usernameOrEmail: string; password: string }) => {
    setUser(
      await apiFetch<AuthUser>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    )
  }, [])

  const logOut = useCallback(async () => {
    try {
      await apiFetch<void>('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, isLoading, isUnreachable, retry, register, logIn, logOut }),
    [user, isLoading, isUnreachable, retry, register, logIn, logOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
