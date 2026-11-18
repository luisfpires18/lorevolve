import type { Dispatch, RefObject, SetStateAction } from 'react'
import { EditConflict } from '../EditConflict'
import { useI18n } from '../../i18n'
import { getProgression } from '../../progression/api'
import type { Progression } from '../../progression/types'
import {
  draftOf,
  listOf,
  nameOf,
  type Item,
  type ItemDraft,
  type Kind,
} from '../../progression/itemDraft'

/** The drawer's notice that the progression changed elsewhere, with Keep mine and Use latest. */
export function ItemConflict({
  universeId,
  entityId,
  kind,
  item,
  setBase,
  setInitial,
  setDraft,
  setConflict,
  nameInput,
  saveButton,
}: {
  universeId: string
  entityId: string
  kind: Kind
  item: Item | null
  setBase: Dispatch<SetStateAction<Progression>>
  setInitial: Dispatch<SetStateAction<ItemDraft>>
  setDraft: Dispatch<SetStateAction<ItemDraft>>
  setConflict: Dispatch<SetStateAction<boolean>>
  nameInput: RefObject<HTMLInputElement | null>
  saveButton: RefObject<HTMLButtonElement | null>
}) {
  const { t } = useI18n()
  return (
    <EditConflict
      what={t('progression.item.conflictWhat')}
      read={() => getProgression(universeId, entityId)}
      renderLatest={(latest) => (
        <ul className="namelist">
          {listOf(latest, kind).map((one) => (
            <li key={one.id}>{nameOf(one)}</li>
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
        const reread = listOf(latest, kind).find((one) => one.id === item?.id) ?? null
        setDraft(draftOf(reread))
        setInitial(draftOf(reread))
        setConflict(false)
        requestAnimationFrame(() => nameInput.current?.focus())
      }}
      testId={`${kind}-conflict`}
    />
  )
}
