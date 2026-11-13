import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { ApiError, apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

/**
 * Forgot password (#69). The answer is the same whether or not the address has an account, so the page never says
 * which; the email, if any, carries a link to `/reset-password` that works once, for an hour.
 */
export default function ForgotPasswordPage() {
  const { t, tx } = useI18n()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      })
      setSentTo(email.trim())
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.email ?? failure.message)
          : t('auth.forgot.failed'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading={t('auth.forgot.heading')}
      intro={t('auth.forgot.intro')}
      footer={<Link to="/login">{t('auth.forgot.back')}</Link>}
    >
      {sentTo ? (
        <p className="callout" role="status" data-testid="forgot-sent">
          {tx('auth.forgot.sent', { email: <bdi>{sentTo}</bdi> })}
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit} noValidate>
          <Field
            label={t('auth.forgot.email')}
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            value={email}
            error={error ?? undefined}
            onChange={(event) => setEmail(event.target.value)}
          />

          <button className="button" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
