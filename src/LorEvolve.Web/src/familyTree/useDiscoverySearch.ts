import { useEffect, useState } from 'react'
import type { useSearchParams } from 'react-router-dom'
import type { useDiscoveryState } from './useDiscoveryState'

export function useDiscoverySearch({
  q,
  text,
  setText,
  searchParams,
  setSearchParams,
}: ReturnType<typeof useDiscoveryState> & {
  q: string
  searchParams: URLSearchParams
  setSearchParams: ReturnType<typeof useSearchParams>[1]
}) {
  // The address leads: Back or Forward to another search puts its words back in the box. Adjusted while rendering, when
  // the address's search changes, rather than in an effect.
  const [shownQ, setShownQ] = useState(q)
  if (shownQ !== q) {
    setShownQ(q)
    if (text.trim() !== q) setText(q)
  }

  // Typing settles for a moment before the address - and so the list - follows, on the first page, replacing the entry
  // rather than leaving one per keystroke in the history.
  useEffect(() => {
    if (text.trim() === q) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams)
      if (text.trim()) next.set('q', text.trim())
      else next.delete('q')
      next.delete('page')
      setSearchParams(next, { replace: true })
    }, 150)
    return () => {
      clearTimeout(timer)
    }
  }, [text, q, searchParams, setSearchParams])
}
