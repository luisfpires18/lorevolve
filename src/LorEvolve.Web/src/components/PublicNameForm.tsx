import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { useLeaveGuard } from '../lib/leaveGuard'
import { getPublicName, setPublicName } from '../profile/api'
import { PUBLIC_NAME_MAX } from '../publishing/types'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { FormActions } from './FormActions'

/**
 * The account's public name: the "by …" on its published universes, and the only thing about the account the
 * public portal ever shows. Chosen here, never filled in from the username or the email. Its own small form,
 * guarded while it holds an unsaved change; clearing it is refused while any universe is public.
 */
export function PublicNameForm() {
  const { t } = useI18n()
  const inputId = useId()
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
  useLeaveGuard(isDirty ? t('account.publicName.unsaved') : null)

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
          : t('account.publicName.saveFailed'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (loadFailed) {
    return (
      <p className="field__error" role="alert">
        {t('account.publicName.loadFailed')}
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
      <Field
        label={t('account.publicName.label')}
        id={inputId}
        hint={t('account.publicName.hint')}
        error={
          error ? (
            <span role="alert" data-testid="public-name-error">
              {error}
            </span>
          ) : undefined
        }
      >
        {(control) => (
          <input
            id={control.id}
            className="field__input"
            dir="auto"
            maxLength={PUBLIC_NAME_MAX}
            value={value}
            disabled={!loaded}
            aria-describedby={control['aria-describedby']}
            aria-invalid={control['aria-invalid']}
            onChange={(event) => {
              setDone(false)
              setValue(event.target.value)
            }}
            data-testid="public-name"
          />
        )}
      </Field>
      <FormActions
        submitLabel={t('account.publicName.save')}
        busy={isSaving}
        busyLabel={t('account.publicName.saving')}
        disabled={!loaded}
        submitTestId="save-public-name"
        inline
      >
        {done && !isDirty ? (
          <p className="settings__saved" role="status" data-testid="public-name-saved">
            {t('account.publicName.saved')}
          </p>
        ) : null}
      </FormActions>
    </form>
  )
}
