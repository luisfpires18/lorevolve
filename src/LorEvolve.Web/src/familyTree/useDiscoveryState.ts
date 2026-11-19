import { useId, useRef, useState } from 'react'
import type { Load } from '../lib/useAsyncRead'
import type { FamilyDiscoveryPage } from './types'

export function useDiscoveryState({ q }: { q: string }) {
  const [text, setText] = useState(q)
  const [state, setState] = useState<Load<FamilyDiscoveryPage>>({ kind: 'loading' })
  // The search and page the state above answers, so an answer for another one reads as still on its way.
  const [answeredKey, setAnsweredKey] = useState('')
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
    answeredKey,
    setAnsweredKey,
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
