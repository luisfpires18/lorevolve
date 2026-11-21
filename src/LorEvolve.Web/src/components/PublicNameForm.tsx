import { useEffect, useId, useState, type FormEvent } from 'react'
import { ApiError } from '../lib/api'
import { useDiscardGuard } from '../lib/useDiscardGuard'
import { useFormSave } from '../lib/useFormSave'
import { getPublicName, setPublicName } from '../profile/api'
import { PUBLIC_NAME_MAX } from '../publishing/types'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

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
  const {
    isSaving,
    message: error,
    save,
  } = useFormSave({
    needChange: null,
    failed: t('account.publicName.saveFailed'),
    refusal: (problem) =>
      problem instanceof ApiError
        ? (problem.fieldErrors.publicdisplayname ?? problem.message)
        : false,
  })
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
  useDiscardGuard(isDirty, t('account.publicName.unsaved'))

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDone(false)
    await save(async () => {
      const next = await setPublicName(value.trim() || null)
      setSaved(next)
      setValue(next ?? '')
      setDone(true)
    })
  }

  if (loadFailed) {
    return <FormMessage>{t('account.publicName.loadFailed')}</FormMessage>
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
        error={error || undefined}
        announce
        errorTestId="public-name-error"
        name={null}
        dir="auto"
        maxLength={PUBLIC_NAME_MAX}
        value={value}
        disabled={!loaded}
        onChange={(event) => {
          setDone(false)
          setValue(event.target.value)
        }}
        data-testid="public-name"
      />
      <FormActions
        submitLabel={t('account.publicName.save')}
        busy={isSaving}
        busyLabel={t('account.publicName.saving')}
        disabled={!loaded}
        submitTestId="save-public-name"
        inline
      >
        {done && !isDirty ? (
          <QuietNote tone="saved" role="status" testId="public-name-saved">
            {t('account.publicName.saved')}
          </QuietNote>
        ) : null}
      </FormActions>
    </form>
  )
}
