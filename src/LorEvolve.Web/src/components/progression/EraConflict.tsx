import type { Dispatch, RefObject, SetStateAction } from 'react'
import { EditConflict } from '../EditConflict'
import { t, useI18n } from '../../i18n'
import { getProgression } from '../../progression/api'
import type { Era, Progression } from '../../progression/types'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { draftOf, type EraDraft } from '../../progression/eraDraft'

/** The era drawer's notice that the progression changed elsewhere, with Keep mine and Use latest. */
export function EraConflict({
  universeId,
  entityId,
  era,
  definitions,
  setBase,
  setDraft,
  setConflict,
  nameInput,
  saveButton,
}: {
  universeId: string
  entityId: string
  era: Era | null
  definitions: FieldDefinition[]
  setBase: Dispatch<SetStateAction<Progression>>
  setDraft: Dispatch<SetStateAction<EraDraft>>
  setConflict: Dispatch<SetStateAction<boolean>>
  nameInput: RefObject<HTMLInputElement | null>
  saveButton: RefObject<HTMLButtonElement | null>
}) {
  useI18n()
  return (
    <EditConflict
      what={t('time.eraForm.conflictWhat')}
      read={() => getProgression(universeId, entityId)}
      renderLatest={(latest) => (
        <ul className="namelist">
          {latest.eras.map((one) => (
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
        const reread = latest.eras.find((one) => one.id === era?.id) ?? null
        setDraft(draftOf(reread, definitions))
        setConflict(false)
        requestAnimationFrame(() => nameInput.current?.focus())
      }}
      testId="era-conflict"
    />
  )
}
