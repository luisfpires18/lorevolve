import { useId, useRef, useState } from 'react'
import type { FamilyDiscoveryPage } from './types'

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; key: string; result: FamilyDiscoveryPage }
  | { kind: 'error'; key: string }

export function useDiscoveryState({ q }: { q: string }) {
  const [text, setText] = useState(q)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [isFinding, setIsFinding] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusHeading = useRef(false)
  const headingId = useId()
  const searchId = useId()
  const pickerId = useId()
  return {
    text,
    setText,
    state,
    setState,
    reads,
    setReads,
    isFinding,
    setIsFinding,
    pickerRef,
    headingRef,
    focusHeading,
    headingId,
    searchId,
    pickerId,
  }
}
