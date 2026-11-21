import { useState, type ReactNode } from 'react'
import { Field } from './Field'
import { QuietNote } from './QuietNote'
import { SimpleFormDrawer } from './SimpleFormDrawer'

interface PickOneDrawerProps {
  testId: string
  titleId: string
  title: ReactNode
  /** The select's label. */
  label: ReactNode
  /** The empty first option: "Choose a phase". */
  choose: ReactNode
  options: { value: string; label: ReactNode }[]
  /** Given: drawn instead of the select when there is nothing to pick. */
  emptyText?: ReactNode
  submitLabel: ReactNode
  /** A failed add's fallback words. */
  failed: string
  selectTestId: string
  submitTestId: string
  onClose: () => void
  /** The chosen option's value. A rejection keeps the drawer open with its message. */
  onAdd: (value: string) => Promise<unknown>
}

/** A drawer that picks one option and adds it: a production to a saga's phase, a part to a comic collection. */
export function PickOneDrawer({
  testId,
  titleId,
  title,
  label,
  choose,
  options,
  emptyText,
  submitLabel,
  failed,
  selectTestId,
  submitTestId,
  onClose,
  onAdd,
}: PickOneDrawerProps) {
  const [chosen, setChosen] = useState('')

  return (
    <SimpleFormDrawer
      testId={testId}
      titleId={titleId}
      title={title}
      submitLabel={submitLabel}
      showBusy={false}
      disabled={chosen === ''}
      submitTestId={submitTestId}
      canSave={options.some((option) => option.value === chosen)}
      failed={failed}
      onSave={() => onAdd(chosen)}
      onClose={onClose}
    >
      {emptyText !== undefined && options.length === 0 ? (
        <QuietNote spacing="flush">{emptyText}</QuietNote>
      ) : (
        <Field
          as="select"
          label={label}
          value={chosen}
          data-testid={selectTestId}
          onChange={(event) => setChosen(event.target.value)}
        >
          <option value="">{choose}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Field>
      )}
    </SimpleFormDrawer>
  )
}
