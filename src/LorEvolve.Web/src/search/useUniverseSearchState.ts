import { useId, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { searchQuery } from './api'
import type { SearchResponse } from './types'

/** A search that has come back, for the query it was sent for. Nothing else is ever shown as its results. */
export type Settled =
  { query: string; kind: 'ready'; response: SearchResponse } | { query: string; kind: 'error' }

/** The search bar's navigation, ids, the box's ref and its states. */
export function useUniverseSearchState() {
  const navigate = useNavigate()
  const location = useLocation()
  const baseId = useId()
  const inputId = `${baseId}input`
  const listId = `${baseId}list`
  const hintId = `${baseId}hint`
  const optionId = (index: number) => `${baseId}option${index}`

  const input = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  const [settled, setSettled] = useState<Settled | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [opened, setOpened] = useState('')

  // Held as the location the list was opened at, not a boolean, so arriving anywhere else - a result, a link, Back -
  // closes it without an effect chasing the address.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = openAt === location.key

  // The highlighted option belongs to one query: typing anything else lets go of it.
  const [active, setActive] = useState<{ query: string; index: number } | null>(null)

  const query = searchQuery(text)
  return {
    navigate,
    location,
    baseId,
    inputId,
    listId,
    hintId,
    optionId,
    input,
    text,
    setText,
    settled,
    setSettled,
    attempt,
    setAttempt,
    opened,
    setOpened,
    openAt,
    setOpenAt,
    isOpen,
    active,
    setActive,
    query,
  }
}
