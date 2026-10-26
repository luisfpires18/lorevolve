export interface AuthUser {
  id: string
  username: string
  email: string
  /** Only whether to offer the Admin workspace (#40). Every admin route checks the role again on the server. */
  isAdmin: boolean
}

export interface AuthContextValue {
  user: AuthUser | null
  /** True until the first /api/auth/me probe settles, so routes can hold the paint. */
  isLoading: boolean
  register: (input: {
    username: string
    email: string
    password: string
    /** A universe invitation's token or an Admin's sign-up link, read when registration is invitation-only. */
    inviteToken?: string
  }) => Promise<void>
  logIn: (input: { usernameOrEmail: string; password: string }) => Promise<void>
  logOut: () => Promise<void>
}
