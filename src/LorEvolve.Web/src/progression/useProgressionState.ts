import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntityDetail } from '../lore/types'
import { getProgression } from './api'
import type { Ability, Appearance, Era, Form, Progression } from './types'

/** An entry's progression as read, the drawers and the history key, with the read that guards against a stale answer. */
export function useProgressionState({
  universeId,
  entry,
}: {
  universeId: string
  entry: EntityDetail
}) {
  const [progression, setProgression] = useState<Progression | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Era | 'new' | null>(null)
  const [editingItem, setEditingItem] = useState<{
    kind: 'form' | 'ability' | 'appearance'
    item: Form | Ability | Appearance | null
  } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  // One change at a time: a second press while one is saving would name the same version and be refused as stale.
  const [busy, setBusy] = useState(false)
  // Each read and each save takes a ticket; a read answers only if nothing was read or saved after it started.
  const ticket = useRef(0)

  const load = useCallback(
    (signal?: AbortSignal) => {
      const mine = ++ticket.current
      return getProgression(universeId, entry.id, signal)
        .then((read) => {
          if (mine !== ticket.current) return
          setProgression(read)
          setFailed(false)
        })
        .catch(() => {
          if (!signal?.aborted && mine === ticket.current) setFailed(true)
        })
    },
    [universeId, entry.id],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  return {
    progression,
    setProgression,
    failed,
    setFailed,
    editing,
    setEditing,
    editingItem,
    setEditingItem,
    message,
    setMessage,
    historyKey,
    setHistoryKey,
    busy,
    setBusy,
    ticket,
    load,
  }
}
