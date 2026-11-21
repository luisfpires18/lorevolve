import { useId, useRef, useState } from 'react'

export function useDiscoveryState({ q }: { q: string }) {
  const [text, setText] = useState(q)
  // The search and page the read answers, so an answer for another one reads as still on its way.
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
