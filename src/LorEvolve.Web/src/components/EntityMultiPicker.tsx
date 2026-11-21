import { EntityPicker, type EntityChoice } from './EntityPicker'

interface EntityMultiPickerProps {
  label: string
  hint?: string
  universeId: string
  /** Everyone and everything already taking part, in the order they were added. */
  value: EntityChoice[]
  onChange: (choices: EntityChoice[]) => void
  placeholder?: string
  error?: string
}

/**
 * Several entities at once, on the same search. Chosen ones sit as tokens in the field
 * and drop out of the results, so nothing can be added twice. EntityPicker with `multiple`.
 */
export function EntityMultiPicker(props: EntityMultiPickerProps) {
  return <EntityPicker {...props} multiple />
}
