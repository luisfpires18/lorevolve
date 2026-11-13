import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { ApiError, apiFetch } from '../lib/api'
import { useI18n } from '../i18n'

/**
 * The page a password reset email opens (#69): `/reset-password#user=&token=`, the token in the fragment so it never
 * reaches a request log. A `?user=&token=` link sent before that change still works. A new password ends every session
 * the account had, so it signs in afresh rather than here.
 */
export default function ResetPasswordPage() {
  const { t, tx } = useI18n()
  const location = useLocation()
  const query = new URLSearchParams(
    location.hash.length > 1 ? location.hash.slice(1) : location.search,
  )
  const userId = query.get('user') ?? ''
  const token = query.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setFieldErrors({ confirmpassword: t('auth.reset.passwordsMatch') })
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId, token, password }),
      })
      setDone(true)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        const { token: tokenError, ...rest } = error.fieldErrors
        setFieldErrors(rest)
        if (tokenError || Object.keys(rest).length === 0) setMessage(tokenError ?? error.message)
      } else {
        setMessage(t('auth.reset.failed'))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const linkMissing = !userId || !token

  return (
    <AuthLayout
      heading={t('auth.reset.heading')}
      intro={t('auth.reset.intro')}
      footer={<Link to="/login">{t('auth.reset.back')}</Link>}
    >
      {done ? (
        <p className="callout" role="status" data-testid="reset-done">
          {tx('auth.reset.done', { link: <Link to="/login">{t('auth.reset.doneSignIn')}</Link> })}
        </p>
      ) : linkMissing ? (
        <p className="callout" role="status" data-testid="reset-link-missing">
          {tx('auth.reset.linkMissing', {
            link: <Link to="/forgot-password">{t('auth.reset.linkMissingAsk')}</Link>,
          })}
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit} noValidate>
          {message ? (
            <p className="form__message" role="alert" data-testid="auth-error">
              {message} <Link to="/forgot-password">{t('auth.reset.askAgain')}</Link>
            </p>
          ) : null}

          <Field
            label={t('auth.reset.newPassword')}
            name="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Field
            label={t('auth.reset.confirmPassword')}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            error={fieldErrors.confirmpassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <button className="button" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? t('auth.reset.submitting') : t('auth.reset.submit')}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
