import { Search } from 'lucide-react'
import type { InputHTMLAttributes, KeyboardEvent, ReactNode, Ref } from 'react'
import { Field } from './Field'

type NativeInput = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'className' | 'type' | 'children'
>

/**
 * A search box over a list or inside a drawer: the Search icon and a search input under a label. Escape with text in it
 * clears the text and goes no further, so a drawer's first Escape clears and its second closes.
 * With no `label` it draws only the icon and the input, for use inside another `Field`'s slot.
 * The two header bars (`PortalSearch`, `UniverseSearch`) are their own.
 */
export function SearchField({
  id,
  label,
  hideLabel,
  value,
  onChange,
  className,
  inputRef,
  trailing,
  testId,
  onKeyDown,
  ...input
}: NativeInput & {
  label?: ReactNode
  /** The label stays for screen readers. */
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  /** Sizing, on the field's wrapper. */
  className?: string
  inputRef?: Ref<HTMLInputElement>
  /** A control at the field's end, with room kept for it (Lore's Exact toggle). */
  trailing?: ReactNode
  testId?: string
}) {
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)
    if (event.key === 'Escape' && value) {
      event.preventDefault()
      event.stopPropagation()
      onChange('')
    }
  }

  const draw = (control: { id?: string; 'aria-describedby'?: string }) => (
    <span className={trailing ? 'searchfield searchfield--trailing' : 'searchfield'}>
      <Search
        className="searchfield__icon"
        aria-hidden="true"
        focusable="false"
        strokeWidth={1.75}
      />
      <input
        autoComplete="off"
        spellCheck={false}
        dir="auto"
        {...input}
        {...control}
        ref={inputRef}
        className="field__input searchfield__input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={keyDown}
        data-testid={testId}
      />
      {trailing}
    </span>
  )

  if (label === undefined) return draw({ id })
  return (
    <Field id={id} label={label} hideLabel={hideLabel} className={className}>
      {draw}
    </Field>
  )
}
