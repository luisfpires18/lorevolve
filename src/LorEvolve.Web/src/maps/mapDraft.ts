import type { MapDetail } from './types'

export interface MapDraft {
  name: string
  description: string
}

export type MapFormProps =
  | { mode: 'new'; universeId: string; onClose: () => void; onSaved: (map: MapDetail) => void }
  | {
      mode: 'details'
      universeId: string
      map: MapDetail
      onClose: () => void
      onSaved: (map: MapDetail) => void
    }
  | {
      mode: 'replace'
      universeId: string
      map: MapDetail
      onClose: () => void
      onSaved: (map: MapDetail) => void
    }

export function inputOf(draft: MapDraft) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() === '' ? null : draft.description.trim(),
  }
}
