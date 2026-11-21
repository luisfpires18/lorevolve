import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { EntityChoice } from '../components/EntityPicker'
import { CANON_ORDER, type CanonStatusValue } from '../lore/types'
import type { TimelineEntry } from './types'
import { SOURCES } from './timelineSources'

export type FormState =
  { mode: 'closed' } | { mode: 'new' } | { mode: 'edit'; entry: TimelineEntry }

/** The Timeline screen's address values and state: filters, search and page come from the address. */
export function useTimelineState() {
  const [params, setParams] = useSearchParams()
  const linkedMoment = params.get('moment')
  const storyId = params.get('story')
  const sourceParam = SOURCES.find((option) => option.value === params.get('source')) ?? null
  const statusParam = params.get('status')
  const canonStatus =
    statusParam !== null && CANON_ORDER.some((status) => String(status) === statusParam)
      ? (Number(statusParam) as CanonStatusValue)
      : null
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const [participant, setParticipant] = useState<EntityChoice | null>(null)
  const [typed, setTyped] = useState(search)
  const [form, setForm] = useState<FormState>({ mode: 'closed' })
  const [message, setMessage] = useState<string | null>(null)

  return {
    params,
    setParams,
    linkedMoment,
    storyId,
    sourceParam,
    statusParam,
    canonStatus,
    search,
    page,
    participant,
    setParticipant,
    typed,
    setTyped,
    form,
    setForm,
    message,
    setMessage,
  }
}
