import { ApiError } from '../lib/api'
import { FIELD_LAYOUT_CHANGED_CODE, saveFieldLayout } from './fieldsApi'
import { layoutOf, type DraftSection } from './sectionLayout'
import type { EntityType, FieldDefinition } from './typeDefinitions'
import type { useFieldSectionsState } from './useFieldSectionsState'
import type { useI18n } from '../i18n'

/** A sections drawer's handlers: edit, order, add and remove sections, place and order fields, the stale choice, save. */
export function fieldSectionsActions({
  universeId,
  type,
  onChanged,
  onSaved,
  t,
  added,
  base,
  setBase,
  sections,
  setSections,
  placed,
  setPlaced,
  order,
  setOrder,
  setErrors,
  setMessage,
  setStale,
  setIsSaving,
  focusKey,
  active,
}: ReturnType<typeof useFieldSectionsState> & {
  universeId: string
  type: EntityType
  onChanged: () => Promise<void>
  onSaved: () => Promise<void>
  active: Map<string, FieldDefinition>
} & Pick<ReturnType<typeof useI18n>, 't'>) {
  function patch(key: string, part: Partial<DraftSection>) {
    setSections((current) =>
      current.map((section) => (section.key === key ? { ...section, ...part } : section)),
    )
  }

  function move(index: number, step: number) {
    setSections((current) => {
      const next = [...current]
      const [moving] = next.splice(index, 1)
      next.splice(index + step, 0, moving)
      return next
    })
  }

  /** Puts a field in another section, or none, last there. */
  function place(fieldId: string, key: string) {
    setPlaced((current) => ({ ...current, [fieldId]: key }))
    setOrder((current) => [...current.filter((id) => id !== fieldId), fieldId])
  }

  /** Swaps a field with the one shown before or after it in its own group. */
  function shift(fieldId: string, step: number) {
    setOrder((current) => {
      const shown = current.filter((id) => active.has(id) && placed[id] === placed[fieldId])
      const neighbour = shown[shown.indexOf(fieldId) + step]
      if (!neighbour) return current
      return current.map((id) => (id === fieldId ? neighbour : id === neighbour ? fieldId : id))
    })
  }

  function add() {
    added.current += 1
    const key = `new-${added.current}`
    setSections((current) => [...current, { key, id: null, name: '', startsCollapsed: false }])
    focusKey.current = key
  }

  /** Takes a section out of the draft; its fields go back among the ungrouped ones, as the save will say. */
  function remove(key: string) {
    setSections((current) => current.filter((section) => section.key !== key))
    setPlaced((current) =>
      Object.fromEntries(
        Object.entries(current).map(([fieldId, at]) => [fieldId, at === key ? '' : at]),
      ),
    )
  }

  function takeSaved() {
    const layout = layoutOf(type)
    setBase({ layout, version: type.fieldLayoutVersion })
    setSections(layout.sections)
    setPlaced(layout.placed)
    setOrder(layout.order)
    setErrors({})
    setMessage(null)
    setStale(false)
  }

  function keepMine() {
    setBase((current) => ({ ...current, version: type.fieldLayoutVersion }))
    setStale(false)
    setMessage(t('entityTypes.sections.keptMine'))
  }

  async function save() {
    setMessage(null)
    setStale(false)
    const found: Record<string, string> = {}
    const names = new Set<string>()
    for (const section of sections) {
      const name = section.name.trim().toLowerCase()
      if (!name) found[section.key] = t('entityTypes.sections.nameRequired')
      else if (names.has(name)) found[section.key] = t('entityTypes.sections.nameTaken')
      names.add(name)
    }
    setErrors(found)
    if (Object.keys(found).length > 0) {
      focusKey.current = sections.find((section) => found[section.key])!.key
      return
    }

    setIsSaving(true)
    try {
      await saveFieldLayout(
        universeId,
        type.id,
        sections.map((section) => ({
          id: section.id,
          name: section.name.trim(),
          startsCollapsed: section.startsCollapsed,
          fieldIds: order.filter((fieldId) => placed[fieldId] === section.key),
        })),
        order.filter((fieldId) => placed[fieldId] === ''),
        base.version,
      )
      await onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === FIELD_LAYOUT_CHANGED_CODE) {
        setMessage(t('entityTypes.sections.changedMeanwhile'))
        setStale(true)
        await onChanged().catch(() => undefined)
      } else if (error instanceof ApiError) {
        // A section's name refused by the API, under that section; anything else in one line.
        const mapped: Record<string, string> = {}
        for (const [key, text] of Object.entries(error.fieldErrors)) {
          const at = /^sections\[(\d+)\]\.name$/.exec(key)
          if (at && sections[Number(at[1])]) mapped[sections[Number(at[1])].key] = text
        }
        setErrors(mapped)
        setMessage(error.message)
      } else {
        setMessage(t('entityTypes.sections.saveFailed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return { patch, move, place, shift, add, remove, takeSaved, keepMine, save }
}
