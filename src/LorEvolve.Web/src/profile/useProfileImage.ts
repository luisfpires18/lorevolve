import { useContext } from 'react'
import { ProfileImageContext, type ProfileImageContextValue } from './profile-image-context'

export function useProfileImage(): ProfileImageContextValue {
  const context = useContext(ProfileImageContext)
  if (!context) {
    throw new Error('useProfileImage must be used inside ProfileImageProvider')
  }
  return context
}
