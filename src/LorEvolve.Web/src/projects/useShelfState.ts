import { useCallback, useRef, useState } from 'react'
import { t } from '../i18n'
import { useAsyncRead } from '../lib/useAsyncRead'
import { listAllProjects } from './api'
import type { ProjectDetail, ProjectKindValue } from './types'

/** A category shelf's projects, read for the universe and narrowed to the shelf's kinds, with its move and cover state. */
export function useShelfState(universeId: string, kinds: readonly ProjectKindValue[]) {
  const read = useCallback(
    (signal: AbortSignal) =>
      listAllProjects({ universeId }, signal).then((projects) =>
        projects.filter((project) => kinds.includes(project.kind)),
      ),
    [universeId, kinds],
  )
  const {
    load: state,
    setLoad: setState,
    retry,
  } = useAsyncRead(read, { failed: t('projects.list.failed') })
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
    retry,
  }
}
