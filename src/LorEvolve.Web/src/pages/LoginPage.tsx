import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { FormMessage } from '../components/FormMessage'
import { returnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { useI18n } from '../i18n'
import { Button } from '../components/Button'

export default function LoginPage() {
  const { t, tx } = useI18n()
  const { logIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [usernameOrEmail, setUsernameOrEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Back where the visitor came from - the portal page they chose Log in on, or the screen that asked for a
  // session - and the workspace only when they came from nowhere in particular.
  const destination = returnPath(location.state)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setIsSubmitting(true)

    try {
      await logIn({ usernameOrEmail, password })
      await navigate(destination, { replace: true })
    } catch (error: unknown) {
      setMessage(error instanceof ApiError ? error.message : t('auth.login.unavailable'))
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading={t('auth.login.heading')}
      intro={t('auth.login.intro')}
      footer={tx('auth.login.noAccount', {
        link: (
          <Link to="/register" state={location.state}>
            {t('auth.login.createAccount')}
          </Link>
        ),
      })}
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        <FormMessage testId="auth-error">{message}</FormMessage>

        <Field
          label={t('auth.login.usernameOrEmail')}
          name="usernameOrEmail"
          autoComplete="username"
          autoFocus
          required
          value={usernameOrEmail}
          onChange={(event) => setUsernameOrEmail(event.target.value)}
        />

        <Field
          label={t('auth.login.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="form__aside">
          <Link to="/forgot-password" data-testid="forgot-password-link">
            {t('auth.login.forgot')}
          </Link>
        </p>

        <Button busy={isSubmitting} busyLabel={t('auth.login.submitting')} type="submit">
          {t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  )
}
