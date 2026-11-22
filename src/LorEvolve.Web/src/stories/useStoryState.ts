import { useRef, useState } from 'react'
import type { Load } from '../lib/useAsyncRead'
import type { ContentPublicationState } from '../publishing/types'
import type { Chapter, PlotArc, Scene, StoryDetail } from './types'

export type SceneFormState =
  | { mode: 'closed' }
  | { mode: 'new'; chapterId: string | null }
  | { mode: 'edit'; scene: Scene; addBeat?: boolean }
  | { mode: 'suggest'; scene: Scene }

export type ChapterFormState =
  | { mode: 'closed' }
  | { mode: 'new'; arcId: string | null }
  | { mode: 'edit'; chapter: Chapter; index: number }

export type ArcFormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; arc: PlotArc; index: number }

export type StoryViewName = 'scenes' | 'manuscript'

/** Every state and ref of a story's page: what is read, the open forms, what was sent and said, and what is moving. */
export function useStoryState() {
  const [state, setState] = useState<Load<StoryDetail>>({ kind: 'loading' })
  const [stale, setStale] = useState(false)
  const [sceneForm, setSceneForm] = useState<SceneFormState>({ mode: 'closed' })
  const [chapterForm, setChapterForm] = useState<ChapterFormState>({ mode: 'closed' })
  const [arcForm, setArcForm] = useState<ArcFormState>({ mode: 'closed' })
  const [storyForm, setStoryForm] = useState<'closed' | 'edit' | 'suggest'>('closed')
  // A suggestion just sent from this page, said where it can be seen (task 045).
  const [sent, setSent] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [reloads, setReloads] = useState(0)

  // A refusal is held with the address it was raised on, like the manuscript outline's open state, so one raised on
  // the Scenes view is not still standing when the author comes back to it from the Manuscript view.
  const [raised, setRaised] = useState<{ at: string; text: string } | null>(null)
  const isMoving = useRef(false)
  const pendingFocus = useRef<string | null>(null)

  // The story's own publication, read once for the page: its pill shows it, and every part's pill needs to know whether
  // the story is public to say Selected or Public (ADR 0039). Held with the story it was read for.
  const [publication, setPublication] = useState<{
    storyId: string
    state: ContentPublicationState | null
  } | null>(null)
  return {
    state,
    setState,
    stale,
    setStale,
    sceneForm,
    setSceneForm,
    chapterForm,
    setChapterForm,
    arcForm,
    setArcForm,
    storyForm,
    setStoryForm,
    sent,
    setSent,
    announcement,
    setAnnouncement,
    reloads,
    setReloads,
    raised,
    setRaised,
    isMoving,
    pendingFocus,
    publication,
    setPublication,
  }
}
