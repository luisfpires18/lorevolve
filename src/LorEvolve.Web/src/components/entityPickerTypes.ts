import type { Chronology } from '../chronology/types'

/** What a picker hands back: enough to show a name without a second request. */
export interface EntityChoice {
  id: string
  name: string
  /** The entry's type, where a chooser keeps it to tell two of the same name apart. */
  typeName?: string
}

/**
 * Quick Create (Issue #25), which a picker offers only when it is given this: an entry's link fields and its relation's
 * other end, for someone who may create Lore. Every other picker leaves it out and is unchanged.
 */
export interface QuickCreateOptions {
  /** For a required number that is a year in one of the universe's date periods. */
  chronology: Chronology
  /** Said once the new entry exists: what still has to be saved for the choice to be kept. */
  keepHint: string
}

/** One entity or none, or (`multiple`) a list of them kept as removable tokens in the field. */
type PickerValue =
  | {
      multiple?: false
      /** The entity currently chosen, so the field can show its name rather than an id. */
      value: EntityChoice | null
      onChange: (choice: EntityChoice | null) => void
    }
  | {
      multiple: true
      /** Everyone and everything already taking part, in the order they were added. They drop out of the results. */
      value: EntityChoice[]
      onChange: (choices: EntityChoice[]) => void
    }

export type EntityPickerProps = PickerValue & {
  label: string
  /** Draws " (required)" after the field's label; the listbox keeps the plain name. */
  requiredMark?: boolean
  hint?: string
  universeId: string
  /** Left out of the results. Normally the entry being edited. */
  excludeId?: string
  /** Only entries whose type is enabled for the Family Tree. */
  familyTreeOnly?: boolean
  /**
   * Only entries of this type or a type nested beneath it, searched for by the API rather than filtered here: a link field
   * limited to one type (Issue #61). Null or left out offers every type.
   */
  entityTypeId?: string | null
  /** Only entries whose type is in this semantic group: a link field limited to a group. */
  entityTypeGroupId?: string | null
  error?: string
  /** Offers Create "..." beside the matches (Issue #25). Left out, the picker only finds entries that exist. */
  quickCreate?: QuickCreateOptions | null
}
