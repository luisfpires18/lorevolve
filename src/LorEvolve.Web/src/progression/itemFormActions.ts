import { abilityInputOf, appearanceInputOf, eraInputOf, formInputOf, saveProgression } from './api'
import type { AbilityInput, AppearanceInput, FormInput, Progression } from './types'
import { inputOf, partOf, SHOWN, type Item, type Kind, type wordsOf } from './itemDraft'
import type { useItemFormState } from './useItemFormState'

/** A form, ability or appearance drawer's handlers: editing the draft, the era ticks, and Save. */
export function itemFormActions({
  universeId,
  entityId,
  kind,
  item,
  onSaved,
  words,
  key,
  base,
  draft,
  edit,
  form: saving,
  setConflict,
}: ReturnType<typeof useItemFormState> & {
  universeId: string
  entityId: string
  kind: Kind
  item: Item | null
  onSaved: (progression: Progression) => void
  words: ReturnType<typeof wordsOf>
  key: string
}) {
  function toggle(list: string[], id: string, on: boolean) {
    return on ? [...new Set([...list, id])] : list.filter((one) => one !== id)
  }

  /** Ticks the era chosen as the first unlock and every era after it in the author's order - explicit ticks, saved as such. */
  function fromUnlockOn() {
    const at = base.eras.findIndex((era) => era.id === draft.unlockEraId)
    if (at === -1) return
    edit({ eraIds: [...new Set([...draft.eraIds, ...base.eras.slice(at).map((era) => era.id)])] })
  }

  async function save() {
    const mine = inputOf(draft, item?.id ?? null)
    const forms: FormInput[] = base.forms.map((form) => formInputOf(form))
    const abilities: AbilityInput[] = base.abilities.map((ability) => abilityInputOf(ability))
    const appearances: AppearanceInput[] = base.appearances.map((one) => appearanceInputOf(one))

    if (kind === 'appearance') {
      const look: AppearanceInput = {
        id: mine.id,
        label: mine.name,
        notes: mine.description,
        eraIds: mine.eraIds,
        formIds: mine.formIds,
        sceneIds: mine.sceneIds,
      }
      const at = appearances.findIndex((one) => one.id === item?.id)
      if (at === -1) appearances.push(look)
      else appearances[at] = look
    } else if (kind === 'form') {
      // A form carries no forms of its own.
      const { formIds: _forms, ...form } = mine
      const at = forms.findIndex((one) => one.id === item?.id)
      if (at === -1) forms.push(form)
      else forms[at] = form
    } else {
      const at = abilities.findIndex((one) => one.id === item?.id)
      if (at === -1) abilities.push(mine)
      else abilities[at] = mine
    }

    await saving.save(
      async () => {
        setConflict(false)
        onSaved(
          await saveProgression(universeId, entityId, {
            eras: base.eras.map(eraInputOf),
            expectedVersion: base.version,
            forms,
            abilities,
            appearances,
          }),
        )
      },
      {
        needChange: (fieldErrors) => {
          // A refusal no field below shows - this one removed meanwhile, say - is said here in its own words.
          const unshown = Object.entries(fieldErrors).find(
            ([name]) =>
              !SHOWN.some((part) => name === `${key}.${partOf(kind, part)}`.toLowerCase()),
          )
          return unshown?.[1] ?? words.someDetails
        },
        failed: words.saveFailed,
      },
    )
  }

  return { edit, toggle, fromUnlockOn, save }
}
