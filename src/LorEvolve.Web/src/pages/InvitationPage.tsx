import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from '../components/AuthLayout'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '../universes/access'
import {
  acceptClaimedInvitation,
  declineClaimedInvitation,
  getClaimedInvitation,
  INVITATION_EXPIRED,
  INVITATION_OTHER_ACCOUNT,
  type ReceivedInvitation,
} from '../universes/collaborators'

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; invitation: ReceivedInvitation }
  | { kind: 'declined' }
  | { kind: 'other-account' }
  | { kind: 'expired' }
  | { kind: 'gone' }
  | { kind: 'error'; message: string }

/**
 * `/invite/:token` - the link an owner sends by hand, carrying the invitation's protected claim token (ADR 0041
 * amendment).
 *
 * The id finds an invitation; it opens nothing. Signed out, this page says only that someone was invited to collaborate
 * - no universe, owner, role or address - and offers Sign in and Create account, both of which come back here (the
 * same router-state return path every sign-in uses). Signed in, the API answers only the account whose email the
 * invitation names; anyone else is told it is for a different account, and not which.
 */
export default function InvitationPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const heading = useRef<HTMLHeadingElement>(null)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useDocumentTitle('Invitation')

  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    getClaimedInvitation(token, controller.signal)
      .then((invitation) => setState({ kind: 'ready', invitation }))
      .catch((problem: unknown) => {
        if (controller.signal.aborted) return
        setState(stateFor(problem))
      })
    return () => {
      controller.abort()
    }
  }, [token, user])

  // Each settled state replaces the heading in place, so the reader is taken to it rather than left where they were.
  useEffect(() => {
    if (state.kind !== 'loading') heading.current?.focus()
  }, [state.kind])

  async function accept() {
    setBusy(true)
    setActionError(null)
    try {
      const accepted = await acceptClaimedInvitation(token)
      await navigate(`/app/universes/${accepted.universeId}`, { replace: true })
    } catch (problem: unknown) {
      setBusy(false)
      settleOrSay(problem)
    }
  }

  async function decline() {
    setBusy(true)
    setActionError(null)
    try {
      await declineClaimedInvitation(token)
      setState({ kind: 'declined' })
    } catch (problem: unknown) {
      settleOrSay(problem)
    } finally {
      setBusy(false)
    }
  }

  function settleOrSay(problem: unknown) {
    if (problem instanceof ApiError && [403, 404, 410].includes(problem.status)) {
      setState(stateFor(problem))
    } else {
      setActionError(
        problem instanceof Error ? problem.message : 'That could not be done. Try again.',
      )
    }
  }

  const back = (
    <Link to="/app" data-testid="invitation-workspace-link">
      Go to My workspace
    </Link>
  )

  if (isLoading) {
    return <div className="session-pending" role="status" aria-label="Checking your session" />
  }

  if (!user) {
    const from = { from: location.pathname }
    return (
      <AuthLayout
        heading="You've been invited to collaborate in LorEvolve."
        intro="Sign in or create an account to continue."
        footer={
          <>
            Use the email address the invitation was sent to.{' '}
            <Link to="/explore">Explore LorEvolve</Link>
          </>
        }
      >
        <div className="invite__actions" data-testid="invitation-signed-out">
          <Link className="button" to="/login" state={from} data-testid="invitation-sign-in">
            Sign in
          </Link>
          <Link
            className="button button--secondary"
            to="/register"
            state={from}
            data-testid="invitation-register"
          >
            Create account
          </Link>
        </div>
      </AuthLayout>
    )
  }

  switch (state.kind) {
    case 'loading':
      return (
        <AuthLayout heading="Invitation" intro="Opening the invitation…" footer={back}>
          <p className="visually-hidden" role="status">
            Opening the invitation
          </p>
        </AuthLayout>
      )
    case 'ready': {
      const { invitation } = state
      return (
        <AuthLayout
          headingRef={heading}
          heading={invitation.universeName}
          intro={`You've been invited as ${ROLE_LABELS[invitation.role]}.`}
          footer={back}
        >
          <div data-testid="invitation-ready">
            <p className="invite__role" data-testid="invitation-role">
              {ROLE_DESCRIPTIONS[invitation.role]}
            </p>
            {actionError ? (
              <p className="form__message" role="alert" data-testid="invitation-error">
                {actionError}
              </p>
            ) : null}
            <div className="invite__actions">
              <button
                className="button"
                type="button"
                onClick={() => void accept()}
                disabled={busy}
                data-testid="invitation-accept"
              >
                {busy ? 'Working' : 'Accept invitation'}
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void decline()}
                disabled={busy}
                data-testid="invitation-decline"
              >
                Decline
              </button>
            </div>
          </div>
        </AuthLayout>
      )
    }
    case 'declined':
      return (
        <Settled
          headingRef={heading}
          heading="Invitation declined."
          intro="Nothing was shared with you, and the invitation is gone."
          footer={back}
          testId="invitation-declined"
        />
      )
    case 'other-account':
      return (
        <Settled
          headingRef={heading}
          heading="This invitation is for a different account."
          intro="Sign in with the account it was sent to, or ask the person who invited you."
          footer={back}
          testId="invitation-other-account"
        />
      )
    case 'expired':
      return (
        <Settled
          headingRef={heading}
          heading="This invitation has expired."
          intro="Ask the person who invited you for a new one."
          footer={back}
          testId="invitation-expired"
        />
      )
    case 'gone':
      return (
        <Settled
          headingRef={heading}
          heading="This invitation is no longer available."
          intro="It may have been withdrawn, or already answered."
          footer={back}
          testId="invitation-gone"
        />
      )
    case 'error':
      return (
        <Settled
          headingRef={heading}
          heading="This invitation could not be opened."
          intro={state.message}
          footer={back}
          testId="invitation-load-error"
        />
      )
  }
}

/** A state with nothing to do but read it and go back. */
function Settled({
  heading,
  intro,
  footer,
  testId,
  headingRef,
}: {
  heading: string
  intro: string
  footer: ReactNode
  testId: string
  headingRef: Ref<HTMLHeadingElement>
}) {
  return (
    <AuthLayout headingRef={headingRef} heading={heading} intro={intro} footer={footer}>
      <span data-testid={testId} hidden />
    </AuthLayout>
  )
}

function stateFor(problem: unknown): State {
  if (problem instanceof ApiError) {
    if (problem.code === INVITATION_OTHER_ACCOUNT) return { kind: 'other-account' }
    if (problem.code === INVITATION_EXPIRED) return { kind: 'expired' }
    if (problem.status === 404) return { kind: 'gone' }
  }
  return {
    kind: 'error',
    message: problem instanceof Error ? problem.message : 'Try again in a moment.',
  }
}
