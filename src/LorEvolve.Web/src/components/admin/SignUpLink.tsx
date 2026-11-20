import { useState, type FormEvent } from 'react'
import { createSignUpLink, emailSignUpLink } from '../../admin/api'
import { Field } from '../Field'
import { ApiError } from '../../lib/api'
import { useDiscardGuard } from '../../lib/useDiscardGuard'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { Section } from '../Section'
import { DateText } from '../DateText'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

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
  // An address typed and not yet sent or made into a link.
  useDiscardGuard(
    email.trim() !== '' && !sending && link === null && sent === null,
    t('admin.signUp.leave'),
  )

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
    <Section title={t('admin.signUp.heading')} titleId="admin-signup-link" rule={false}>
      <QuietNote spacing="block">{t('admin.signUp.note')}</QuietNote>
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
        {error ? <FormMessage>{error}</FormMessage> : null}
        <div className="actions form__actions">
          <Button
            busy={sending}
            busyLabel={t('admin.signUp.sending')}
            onClick={() => void sendEmail()}
            data-testid="admin-signup-email-send"
          >
            {t('admin.signUp.emailLink')}
          </Button>
          <Button
            tone="secondary"
            type="submit"
            disabled={sending}
            data-testid="admin-signup-create"
          >
            {t('admin.signUp.makeLink')}
          </Button>
        </div>
      </form>
      {sent ? (
        <QuietNote spacing="block" role="status" testId="admin-signup-sent">
          {tx('admin.signUp.sent', {
            to: <bdi>{sent.to}</bdi>,
            time: <DateText value={sent.expiresAt} withTime />,
          })}
        </QuietNote>
      ) : null}
      {link ? (
        <QuietNote spacing="block" role="status">
          {tx('admin.signUp.link', {
            time: <DateText value={link.expiresAt} withTime />,
            url: <code data-testid="admin-signup-url">{link.url}</code>,
          })}
        </QuietNote>
      ) : null}
    </Section>
  )
}
