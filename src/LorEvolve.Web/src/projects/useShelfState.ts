import { useRef, useState } from 'react'
import type { ProjectDetail } from './types'

export type LoadState =
  { kind: 'loading' } | { kind: 'ready'; projects: ProjectDetail[] } | { kind: 'failed' }

export function useShelfState() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [covering, setCovering] = useState<ProjectDetail | null>(null)
  const isMoving = useRef(false)
  return {
    state,
    setState,
    announcement,
    setAnnouncement,
    moveError,
    setMoveError,
    covering,
    setCovering,
    isMoving,
  }
}
