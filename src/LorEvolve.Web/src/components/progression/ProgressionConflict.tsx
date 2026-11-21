import type { Dispatch, RefObject, SetStateAction } from 'react'
import { EditConflict } from '../EditConflict'
import { getProgression } from '../../progression/api'
import type { Progression } from '../../progression/types'

/**
 * An era or item drawer's notice that the progression changed elsewhere, with Keep mine and Use latest. Keep mine
 * focuses Save; Use latest takes the re-read draft, hands it to `onUseLatest` if given, and focuses the name.
 */
export function ProgressionConflict<Draft>({
  universeId,
  entityId,
  what,
  testId,
  names,
  draftFrom,
  setBase,
  setDraft,
  setConflict,
  nameInput,
  saveButton,
  onUseLatest,
}: {
  universeId: string
  entityId: string
  what: string
  testId: string
  /** The latest eras or items, listed by name. */
  names: (latest: Progression) => { id: string; name: string }[]
  /** The draft of the thing being edited, as the latest progression has it. */
  draftFrom: (latest: Progression) => Draft
  setBase: Dispatch<SetStateAction<Progression>>
  setDraft: Dispatch<SetStateAction<Draft>>
  setConflict: Dispatch<SetStateAction<boolean>>
  nameInput: RefObject<HTMLInputElement | null>
  saveButton: RefObject<HTMLButtonElement | null>
  /** Use latest also resets this, with a draft of its own (the item drawer's unsaved baseline). */
  onUseLatest?: (draft: Draft) => void
}) {
  return (
    <EditConflict
      what={what}
      read={() => getProgression(universeId, entityId)}
      renderLatest={(latest) => (
        <ul className="namelist">
          {names(latest).map((one) => (
            <li key={one.id}>{one.name}</li>
          ))}
        </ul>
      )}
      onKeepMine={(latest) => {
        setBase(latest)
        setConflict(false)
        requestAnimationFrame(() => saveButton.current?.focus())
      }}
      onUseLatest={(latest) => {
        setBase(latest)
        setDraft(draftFrom(latest))
        onUseLatest?.(draftFrom(latest))
        setConflict(false)
        requestAnimationFrame(() => nameInput.current?.focus())
      }}
      testId={testId}
    />
  )
}
