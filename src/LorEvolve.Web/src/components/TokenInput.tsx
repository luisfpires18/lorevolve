import { useState, type KeyboardEvent } from 'react'

interface TokenInputProps {
  label: string
  name: string
  placeholder: string
  values: string[]
  onChange: (values: string[]) => void
}

/** Comma or Enter commits a token. Used for aliases and tags. */
export function TokenInput({ label, name, placeholder, values, onChange }: TokenInputProps) {
  const [draft, setDraft] = useState('')

  function commit(raw: string) {
    const value = raw.trim().replace(/,$/, '').trim()
    if (!value) return
    if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setDraft('')
      return
    }
    onChange([...values, value])
    setDraft('')
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commit(draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={name}>
        {label}
      </label>
      <div className="tokens" data-testid={`${name}-tokens`}>
        {values.map((value) => (
          <span className="token" key={value}>
            {value}
            <button
              type="button"
              className="token__remove"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((candidate) => candidate !== value))}
            >
              &times;
            </button>
          </span>
        ))}
        <input
          id={name}
          name={name}
          className="tokens__input"
          placeholder={values.length === 0 ? placeholder : ''}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
        />
      </div>
    </div>
  )
}
