import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { returnPath } from '../auth/returnPath'
import { useAuth } from '../auth/useAuth'
import { ApiError, apiFetch } from '../lib/api'

/**
 * The token that lets this visitor register while registration is invitation-only: an Admin's sign-up link
 * (`/register?invite=`), or the universe invitation they came from (the invitation page's return path, `/invite/:token`).
 */
function inviteTokenFor(search: string, state: unknown): string | undefined {
  const fromLink = new URLSearchParams(search).get('invite')
  if (fromLink) return fromLink
  const invitation = /^\/invite\/([^/?#]+)$/.exec(returnPath(state, ''))
  return invitation ? decodeURIComponent(invitation[1]) : undefined
}

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const inviteToken = inviteTokenFor(location.search, location.state)
  // Unknown (null) until the API answers, and nothing is drawn meanwhile: showing the form first and then taking it away
  // was the flash an uninvited visitor saw. Someone holding an invite registers either way, so their form shows at once.
  // If the question fails the form shows, and the API still refuses an uninvited registration.
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(inviteToken ? false : null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch<{ inviteOnly: boolean }>('/api/auth/registration', { signal: controller.signal })
      .then((registration) => setInviteOnly(registration.inviteOnly))
      .catch(() => {
        if (!controller.signal.aborted) setInviteOnly(false)
      })
    return () => controller.abort()
  }, [])

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)

    if (password !== confirmPassword) {
      setFieldErrors({ confirmpassword: 'Both passwords need to match.' })
      return
    }

    setFieldErrors({})
    setIsSubmitting(true)

    try {
      await register({ username, email, password, inviteToken })
      await navigate(returnPath(location.state), { replace: true })
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) {
          setMessage(error.message)
        }
      } else {
        setMessage('Registration is unavailable right now.')
      }
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading="Create account"
      intro="Claim a name, and the workroom is yours."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state}>
            Sign in
          </Link>
        </>
      }
    >
      {inviteOnly === null ? null : inviteOnly && !inviteToken ? (
        <p className="form__message" role="status" data-testid="register-invite-only">
          LorEvolve is invitation-only for now. Open the invitation link you were sent to create
          your account.
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit} noValidate>
          {message ? (
            <p className="form__message" role="alert" data-testid="auth-error">
              {message}
            </p>
          ) : null}

          <Field
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            error={fieldErrors.username}
            onChange={(event) => setUsername(event.target.value)}
          />

          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            error={fieldErrors.email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
          />

          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            error={fieldErrors.confirmpassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />

          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account' : 'Create account'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
