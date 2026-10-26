import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, apiFetch } from '../lib/api'
import { AuthContext } from './auth-context'
import type { AuthUser } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    apiFetch<AuthUser>('/api/auth/me')
      .then((current) => {
        if (active) setUser(current)
      })
      .catch((error: unknown) => {
        // A 401 here is the normal signed-out case, not a failure worth surfacing.
        if (active && !(error instanceof ApiError && error.status === 401)) {
          setUser(null)
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
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
    () => ({ user, isLoading, register, logIn, logOut }),
    [user, isLoading, register, logIn, logOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
