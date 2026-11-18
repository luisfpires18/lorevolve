import { useRef, useState } from 'react'
import type { PublicationState, SelectedLore } from './types'

export type Confirming =
  { kind: 'publish'; state: PublicationState; selected: SelectedLore } | { kind: 'unpublish' }

/** How many entries and stories readers can see now - read from the public API itself, so it cannot disagree with it. */
export type Published = { slug: string; lore: number; stories: number } | null

/** Publish's states: the publication, a load failure, unsaved details, the open confirm, what is busy, said or counted, and the two focus refs. */
export function usePublishState() {
  const [state, setState] = useState<PublicationState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string[] | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [counted, setCounted] = useState<Published>(null)
  // Bumped after Publish everything, so the counts below are read again.
  const [countRound, setCountRound] = useState(0)
  const panel = useRef<HTMLDivElement>(null)
  const problemRef = useRef<HTMLDivElement>(null)

  return {
    state,
    setState,
    loadError,
    setLoadError,
    detailsDirty,
    setDetailsDirty,
    confirming,
    setConfirming,
    busy,
    setBusy,
    problem,
    setProblem,
    announcement,
    setAnnouncement,
    counted,
    setCounted,
    countRound,
    setCountRound,
    panel,
    problemRef,
  }
}
