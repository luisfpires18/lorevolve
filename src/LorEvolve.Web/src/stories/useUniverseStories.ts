import { useCallback } from 'react'
import { useAsyncRead } from '../lib/useAsyncRead'
import { listStories } from './api'

/**
 * The universe's stories, for a picker: one read of the unpaged list (a universe holds a handful of stories). Each
 * picker words loading and failure its own way from the returned state.
 */
export function useUniverseStories(universeId: string) {
  const read = useCallback((signal: AbortSignal) => listStories(universeId, signal), [universeId])
  return useAsyncRead(read).load
}
