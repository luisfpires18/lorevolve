import { AppearanceList } from '../AppearanceList'
import type { EntityDetail } from '../../lore/types'
import type { Progression } from '../../progression/types'
import type { useProgressionState } from '../../progression/useProgressionState'
import type { progressionItemActions } from '../../progression/progressionItemActions'
import { ItemList } from './ItemList'

/** The forms, the abilities and the looks on the main profile. */
export function ProgressionItems({
  universeId,
  entry,
  progression,
  busy,
  setEditingItem,
  moveItem,
  removeItem,
  removeAppearance,
  load,
}: {
  universeId: string
  entry: EntityDetail
  progression: Progression
  busy: boolean
  setEditingItem: ReturnType<typeof useProgressionState>['setEditingItem']
  moveItem: ReturnType<typeof progressionItemActions>['moveItem']
  removeItem: ReturnType<typeof progressionItemActions>['removeItem']
  removeAppearance: ReturnType<typeof progressionItemActions>['removeAppearance']
  load: ReturnType<typeof useProgressionState>['load']
}) {
  return (
    <>
      <ItemList
        kind="form"
        items={progression.forms}
        appearances={progression.appearances}
        universeId={universeId}
        entryName={entry.name}
        busy={busy}
        onAdd={() => setEditingItem({ kind: 'form', item: null })}
        onEdit={(item) => setEditingItem({ kind: 'form', item })}
        onMove={(item, by) => moveItem('form', item.id, by)}
        onRemove={(item) => void removeItem('form', item)}
      />
      <ItemList
        kind="ability"
        items={progression.abilities}
        appearances={progression.appearances}
        universeId={universeId}
        entryName={entry.name}
        busy={busy}
        onAdd={() => setEditingItem({ kind: 'ability', item: null })}
        onEdit={(item) => setEditingItem({ kind: 'ability', item })}
        onMove={(item, by) => moveItem('ability', item.id, by)}
        onRemove={(item) => void removeItem('ability', item)}
      />
      <AppearanceList
        universeId={universeId}
        entityId={entry.id}
        appearances={progression.appearances}
        busy={busy}
        onAdd={() => setEditingItem({ kind: 'appearance', item: null })}
        onEdit={(appearance) => setEditingItem({ kind: 'appearance', item: appearance })}
        onMove={(appearance, by) => moveItem('appearance', appearance.id, by)}
        onRemove={(appearance) => void removeAppearance(appearance)}
        onPicturesChanged={() => void load()}
      />
    </>
  )
}
