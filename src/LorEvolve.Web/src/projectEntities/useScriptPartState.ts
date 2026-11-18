import { useState } from 'react'
import type { PanelScript, ProjectNodeDetail } from './structure'

export const NO_SCRIPT: PanelScript = { dialogue: '', caption: '', sfx: '', notes: '' }

export function useScriptPartState() {
  const [node, setNode] = useState<ProjectNodeDetail | null>(null)
  const [draft, setDraft] = useState('')
  const [script, setScript] = useState<PanelScript>(NO_SCRIPT)
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  const [, setAnnouncement] = useState('')
  return {
    node,
    setNode,
    draft,
    setDraft,
    script,
    setScript,
    isSaving,
    setIsSaving,
    saves,
    setSaves,
    failure,
    setFailure,
    changed,
    setChanged,
    setAnnouncement,
  }
}
