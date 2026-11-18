import { useState, type FormEvent } from 'react'
import { createSignUpLink, emailSignUpLink } from '../../admin/api'
import { Field } from '../Field'
import { ApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'

/**
 * A sign-up link for someone with no universe to be invited into. While registration is invitation-only it lets that one
 * address create an account for seven days; with registration open, anyone can already register.
 */
export function SignUpLink() {
  const { t, tx } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [sent, setSent] = useState<{ to: string; expiresAt: string } | null>(null)
  const [sending, setSending] = useState(false)

  async function sendEmail() {
    setError(null)
    setLink(null)
    setSent(null)
    setSending(true)
    try {
      const made = await emailSignUpLink(email.trim())
      setSent({ to: email.trim(), expiresAt: made.expiresAt })
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.email ?? failure.message)
          : t('admin.signUp.emailFailed'),
      )
    } finally {
      setSending(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLink(null)
    setSent(null)
    try {
      const made = await createSignUpLink(email.trim())
      setLink({
        url: `${window.location.origin}/register?invite=${encodeURIComponent(made.token)}`,
        expiresAt: made.expiresAt,
      })
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.email ?? failure.message)
          : t('admin.signUp.linkFailed'),
      )
    }
  }

  return (
    <section className="adminsection" aria-labelledby="admin-signup-link">
      <h2 className="settings__heading" id="admin-signup-link">
        {t('admin.signUp.heading')}
      </h2>
      <p className="settings__note">{t('admin.signUp.note')}</p>
      <form className="form" onSubmit={submit} noValidate>
        <Field
          label={t('admin.signUp.emailLabel')}
          name="admin-signup-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="admin-signup-email"
        />
        {error ? (
          <p className="form__message" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form__actions">
          <button
            className="button"
            type="button"
            onClick={() => void sendEmail()}
            disabled={sending}
            aria-busy={sending}
            data-testid="admin-signup-email-send"
          >
            {sending ? t('admin.signUp.sending') : t('admin.signUp.emailLink')}
          </button>
          <button
            className="button button--secondary"
            type="submit"
            disabled={sending}
            data-testid="admin-signup-create"
          >
            {t('admin.signUp.makeLink')}
          </button>
        </div>
      </form>
      {sent ? (
        <p className="settings__note" role="status" data-testid="admin-signup-sent">
          {tx('admin.signUp.sent', {
            to: <bdi>{sent.to}</bdi>,
            time: formatDateTime(sent.expiresAt),
          })}
        </p>
      ) : null}
      {link ? (
        <p className="settings__note" role="status">
          {tx('admin.signUp.link', {
            time: formatDateTime(link.expiresAt),
            url: <code data-testid="admin-signup-url">{link.url}</code>,
          })}
        </p>
      ) : null}
    </section>
  )
}
