import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { getPublicName, setPublicName } from '../profile/api'
import { PUBLIC_NAME_MAX } from '../publishing/types'

/**
 * The account's public name: the "by …" on its published universes, and the only thing about the account the
 * public portal ever shows. Chosen here, never filled in from the username or the email. Its own small form,
 * guarded while it holds an unsaved change; clearing it is refused while any universe is public.
 */
export function PublicNameForm() {
  const inputId = useId()
  const hintId = useId()
  const [saved, setSaved] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    getPublicName(controller.signal)
      .then((name) => {
        setSaved(name)
        setValue(name ?? '')
        setLoaded(true)
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true)
      })
    return () => {
      controller.abort()
    }
  }, [])

  const isDirty = loaded && !isSaving && value.trim() !== (saved ?? '')
  useLeaveGuard(isDirty ? 'Your public name has an unsaved change. Leave without saving it?' : null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSaving(true)
    setError(null)
    setDone(false)
    try {
      const next = await setPublicName(value.trim() || null)
      setSaved(next)
      setValue(next ?? '')
      setDone(true)
    } catch (problem: unknown) {
      setError(
        problem instanceof ApiError
          ? (problem.fieldErrors.publicdisplayname ?? problem.message)
          : 'Your public name could not be saved.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <p className="field__error" role="alert">
        Your public name could not be loaded.
      </p>
    )
  }

  return (
    <form
      className="form profile__publicname"
      onSubmit={submit}
      noValidate
      data-testid="public-name-form"
    >
      <div className="field">
        <label className="field__label" htmlFor={inputId}>
          Public name
        </label>
        <input
          id={inputId}
          className="field__input"
          dir="auto"
          maxLength={PUBLIC_NAME_MAX}
          value={value}
          disabled={!loaded}
          aria-describedby={hintId}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDone(false)
            setValue(event.target.value)
          }}
          data-testid="public-name"
        />
        <p className="field__hint" id={hintId}>
          Shown as the author of universes you publish - &ldquo;by …&rdquo; - and nowhere else. Your
          username and email are never shown publicly.
        </p>
        {error ? (
          <p className="field__error" role="alert" data-testid="public-name-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={isSaving || !loaded}
          data-testid="save-public-name"
        >
          {isSaving ? 'Saving' : 'Save public name'}
        </button>
        {done && !isDirty ? (
          <p className="settings__saved" role="status" data-testid="public-name-saved">
            Saved.
          </p>
        ) : null}
      </div>
    </form>
  )
}
