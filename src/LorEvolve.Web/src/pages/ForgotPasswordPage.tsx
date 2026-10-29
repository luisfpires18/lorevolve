import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { Field } from '../components/Field'
import { ApiError, apiFetch } from '../lib/api'

/**
 * Forgot password (#69). The answer is the same whether or not the address has an account, so the page never says
 * which; the email, if any, carries a link to `/reset-password` that works once, for an hour.
 */
export default function ForgotPasswordPage() {
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
          : 'The link cannot be sent right now.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      heading="Forgot your password?"
      intro="Enter your account's email address and we'll send you a link to choose a new one."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {sentTo ? (
        <p className="callout" role="status" data-testid="forgot-sent">
          If <bdi>{sentTo}</bdi> has a LorEvolve account, a link is on its way. It works once, for 1
          hour. Nothing arrived? Check your spam folder, or write to support@lorevolve.com.
        </p>
      ) : (
        <form className="form" onSubmit={handleSubmit} noValidate>
          <Field
            label="Email"
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
            {isSubmitting ? 'Sending' : 'Send the link'}
          </button>
        </form>
      )}
    </AuthLayout>
  )
}
