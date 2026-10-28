import { createContext } from 'react'
import type { ProfileImageRef } from './types'

export interface ProfileImageContextValue {
  /** The signed-in account's photo, or null when it has none or is not signed in. */
  image: ProfileImageRef | null
  /** True until the first read settles, so a circle can hold rather than flash a monogram. */
  isLoading: boolean
  /** What every write path calls with the API's answer, so every avatar agrees at once. */
  changed: (image: ProfileImageRef | null) => void
}

export const ProfileImageContext = createContext<ProfileImageContextValue | null>(null)
