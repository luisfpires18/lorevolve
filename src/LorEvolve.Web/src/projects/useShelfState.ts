import { useRef, useState } from 'react'
import type { Load } from '../lib/useAsyncRead'
import type { ProjectDetail } from './types'

export function useShelfState() {
  const [state, setState] = useState<Load<ProjectDetail[]>>({ kind: 'loading' })
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [covering, setCovering] = useState<ProjectDetail | null>(null)
  const isMoving = useRef(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    setState({ kind: 'loading' })
    setAttempt((current) => current + 1)
  }
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
    attempt,
    retry,
  }
}
