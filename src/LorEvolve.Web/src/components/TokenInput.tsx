import { useState, type KeyboardEvent } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { Token } from './Token'

interface TokenInputProps {
  label: string
  name: string
  values: string[]
  onChange: (values: string[]) => void
}

/** Comma or Enter commits a token. Used for aliases and tags. */
export function TokenInput({ label, name, values, onChange }: TokenInputProps) {
  const { t } = useI18n()
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
    <Field label={label} id={name}>
      {(control) => (
        <div className="tokens" data-testid={`${name}-tokens`}>
          {values.map((value) => (
            <Token
              key={value}
              removeLabel={t('data.tokens.remove', { value })}
              onRemove={() => onChange(values.filter((candidate) => candidate !== value))}
            >
              {value}
            </Token>
          ))}
          <input
            {...control}
            name={name}
            className="tokens__input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commit(draft)}
          />
        </div>
      )}
    </Field>
  )
}
