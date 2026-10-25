import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BRAND_LINK_LABEL, BrandMark } from '../components/BrandMark'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import {
  describeConnectionRequest,
  getConsentToken,
  PROPOSE_FIELD,
  READABLE,
  SCHEMA_FIELD,
  type ConnectionRequestDetails,
  type ConsentToken,
} from '../mcp/api'
import { ROLE_LABELS } from '../universes/access'
import { UniverseRole, type UniverseRoleValue } from '../universes/types'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; details: ConnectionRequestDetails }
  | { kind: 'invalid' }
  | { kind: 'no-access' }
  | { kind: 'error' }

/** The field the decision travels in, beside the request's own parameters. Read by `OAuthEndpoints` on the server. */
const DECISION_FIELD = 'lorex_decision'

/**
 * The consent screen (ADR 0046). An AI app sent the browser to LoreX's authorization endpoint, which validated the
 * request and handed it here unchanged, in the address. This screen shows who is asking and for which universe, and
 * posts the same parameters back with the person's decision and the antiforgery token it read for this account - a
 * same-site post that carries the session, which the server validates all over again before anything is approved. A post
 * without that token, however it rides the session, is sent back here. Approve and Deny are the only ways on; nothing is ever
 * approved without one of them being pressed.
 */
export default function ConnectAuthorizePage() {
  const { search } = useLocation()
  const { user } = useAuth()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [deciding, setDeciding] = useState(false)
  const [token, setToken] = useState<ConsentToken | null>(null)
  const submitted = useRef(false)
  const detailsId = useId()

  useDocumentTitle('Connect an AI app')

  useEffect(() => {
    const controller = new AbortController()
    // A failure to read the antiforgery token (below) stands: without it there is nothing to decide with.
    const settle = (next: Load) => setLoad((current) => (current.kind === 'error' ? current : next))
    describeConnectionRequest(params, controller.signal)
      .then((details) => settle({ kind: 'ready', details }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof ApiError && error.code === 'universe_unavailable')
          settle({ kind: 'no-access' })
        else if (error instanceof ApiError && error.status === 400) settle({ kind: 'invalid' })
        else settle({ kind: 'error' })
      })
    return () => controller.abort()
  }, [params])

  // The antiforgery token the decision must carry. Without it nothing can be decided here, so failing to read it fails
  // the screen.
  useEffect(() => {
    const controller = new AbortController()
    getConsentToken(controller.signal)
      .then(setToken)
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ kind: 'error' })
      })
    return () => controller.abort()
  }, [])

  // The request exactly as it arrived, for the post back. Repeated names (more than one resource) stay repeated.
  const fields = [...params.entries()].filter(
    ([name]) => name !== DECISION_FIELD && name !== token?.fieldName,
  )

  // One decision per screen. The buttons are not disabled: a disabled submit button would leave its own value - the
  // decision - out of the post. A second press is simply not sent.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitted.current) {
      event.preventDefault()
      return
    }
    submitted.current = true
    setDeciding(true)
  }

  // The form holds what is being decided as well as the decision, so its buttons can stay pinned to the foot of the
  // screen while a long request scrolls past them (`.consent__actions`).
  const decide = (content: ReactNode) => (
    <form
      className="consent__form"
      method="post"
      action="/oauth/authorize"
      onSubmit={onSubmit}
      aria-busy={deciding}
      data-testid="consent-form"
    >
      {fields.map(([name, value], index) => (
        <input key={`${name}-${index}`} type="hidden" name={name} value={value} />
      ))}
      {token ? <input type="hidden" name={token.fieldName} value={token.token} /> : null}
      {content}
      <div className="form__actions consent__actions">
        {load.kind === 'ready' ? (
          <button
            className="button"
            type="submit"
            name={DECISION_FIELD}
            value="approve"
            aria-describedby={detailsId}
            data-testid="consent-approve"
          >
            {deciding ? 'Connecting' : 'Approve'}
          </button>
        ) : null}
        <button
          className="button button--secondary"
          type="submit"
          name={DECISION_FIELD}
          value="deny"
          data-testid="consent-deny"
        >
          {load.kind === 'ready' ? 'Deny' : 'Go back to the app'}
        </button>
      </div>
    </form>
  )

  // A request to decide on, or one to turn down: either way the decision waits for the antiforgery token.
  const request =
    load.kind === 'no-access' ? (
      <div className="notice notice--error" role="alert" data-testid="consent-no-access">
        <p>You don&rsquo;t have access to the universe this app asked for.</p>
        <p>Nothing was connected. Going back tells the app it wasn&rsquo;t approved.</p>
      </div>
    ) : load.kind === 'ready' ? (
      <ConsentDetails details={load.details} id={detailsId} />
    ) : null

  return (
    <ConsentLayout
      heading="Connect an AI app"
      intro={
        // The gist, above the fold even when the warnings below are long (issue 38): read-only, manuscripts included,
        // and where the content goes. The full list and notes follow unchanged.
        <>
          This app wants <strong>read-only</strong> access to one of your universes: its lore
          entries, relationships, stories, scene manuscripts and timeline. What it reads goes to the
          AI service behind it. Check who is asking before you approve.
          {load.kind === 'ready' && load.details.proposalsRequested && load.details.canPropose
            ? ' It also asks to propose changes for you to review, which you can allow below.'
            : null}
        </>
      }
      footer={
        user ? (
          <>
            Signed in as <bdi>{user.username}</bdi>.{' '}
            <Link to="/app/profile#connected-apps">See connected apps</Link>
          </>
        ) : null
      }
    >
      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          Checking this request&hellip;
        </p>
      ) : load.kind === 'invalid' ? (
        // An app or a return address LoreX does not recognise: there is nowhere trusted to send the browser back to.
        <div className="notice notice--error" role="alert" data-testid="consent-invalid">
          <p>This connection request isn&rsquo;t valid, so nothing was connected.</p>
          <p>Start again from your AI app.</p>
        </div>
      ) : load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="consent-error">
          <p>LoreX couldn&rsquo;t check this request. Reload the page to try again.</p>
        </div>
      ) : token ? (
        decide(request)
      ) : (
        request
      )}
    </ConsentLayout>
  )
}

/**
 * The consent screen's own frame (issue 38): one card, centred, with the brand kept small. It is a decision, not a
 * landing page, so it does not take the sign-in plate's artwork - the request and its two buttons are the page. A card
 * taller than the screen grows down and scrolls with the page; nothing inside it scrolls on its own.
 */
function ConsentLayout({
  heading,
  intro,
  footer,
  children,
}: {
  heading: string
  intro: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  return (
    <div className="consent-page">
      <main className="consent-card" id={MAIN_CONTENT_ID} tabIndex={-1} data-testid="consent-card">
        <Link
          className="consent-card__brand"
          to="/"
          aria-label={BRAND_LINK_LABEL}
          data-testid="auth-brand"
        >
          <BrandMark />
          <Wordmark />
        </Link>
        <h1 className="auth__heading consent-card__heading" data-testid="auth-heading">
          {heading}
        </h1>
        <p className="consent-card__intro" data-testid="consent-summary">
          {intro}
        </p>
        {children}
        {footer ? <p className="consent-card__footer">{footer}</p> : null}
      </main>
    </div>
  )
}

function ConsentDetails({ details, id }: { details: ConnectionRequestDetails; id: string }) {
  return (
    <div className="consent" id={id} data-testid="consent-details">
      <section className="consent__part" aria-label="The app">
        <p className="consent__label">App</p>
        <p className="consent__app" data-testid="consent-app">
          <bdi>{details.clientName}</bdi>
        </p>
        {details.verifiedHost ? (
          <p className="consent__identity" data-testid="consent-verified">
            Its details are published by <strong>{details.verifiedHost}</strong>, and LoreX fetched
            them from there. The name is the one that site gives.
          </p>
        ) : (
          <p className="callout callout--warning consent__warning" data-testid="consent-unverified">
            LoreX can&rsquo;t confirm who made this app. It registered itself, and it chose its own
            name. Approve only if you just added LoreX to an app you trust.
          </p>
        )}
        <p className="consent__identity" data-testid="consent-return">
          After you decide, your browser goes back to <strong>{details.redirectHost}</strong>.
        </p>
        {details.loopbackOnly ? (
          <p className="callout callout--warning consent__warning" data-testid="consent-loopback">
            This app runs on your own device. Any program on this computer could use that address,
            so approve only if you started this from an app on this computer.
          </p>
        ) : null}
      </section>

      <section className="consent__part" aria-label="The universe">
        <p className="consent__label">Universe</p>
        <p className="consent__universe" data-testid="consent-universe">
          <bdi>{details.universeName}</bdi>
        </p>
        <p className="consent__identity">
          You&rsquo;re {roleWords(details.role)} here. The app gets your access to this universe and
          no other.
        </p>
      </section>

      <section className="consent__part" aria-label="What it can do">
        <p className="consent__label">Read-only access to</p>
        <ul className="consent__list" data-testid="consent-scope">
          {READABLE.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="consent__identity">It can&rsquo;t create, edit or delete anything.</p>
      </section>

      {details.proposalsRequested ? <ProposalChoice details={details} /> : null}

      <section className="consent__part consent__part--notes" aria-label="Before you approve">
        <p className="settings__note">
          What the app reads goes to the AI service behind it, which handles it under its own terms.
          Long manuscripts can take up a lot of the app&rsquo;s context, so it reads them a section
          at a time.
        </p>
        <p className="settings__note">
          The app stays connected until you disconnect it in Profile, Connected apps, or until you
          no longer have access to this universe.
        </p>
      </section>
    </div>
  )
}

/**
 * The separate permission to propose changes (ADR 0047), offered only when the app asked and the role could allow it -
 * and never ticked for the person. Proposing is not writing: what the app sends waits in Pending AI Changes.
 */
function ProposalChoice({ details }: { details: ConnectionRequestDetails }) {
  const [proposing, setProposing] = useState(false)

  if (!details.canPropose) {
    return (
      <section className="consent__part" aria-label="Proposing changes">
        <p className="consent__identity" data-testid="consent-propose-unavailable">
          The app also asked to propose changes. Your role here only reads, so it gets read-only
          access.
        </p>
      </section>
    )
  }

  return (
    <section className="consent__part consent__propose" aria-label="Proposing changes">
      <p className="consent__label">Optional</p>
      <div className="consent__check">
        <input
          id="consent-propose"
          type="checkbox"
          name={PROPOSE_FIELD}
          value="allow"
          aria-describedby="consent-propose-what"
          data-testid="consent-propose"
          onChange={(event) => setProposing(event.target.checked)}
        />
        <label htmlFor="consent-propose">
          Also let <bdi>{details.clientName}</bdi> propose changes for you to review
        </label>
      </div>
      <p className="consent__identity" id="consent-propose-what">
        It could send new or changed lore, articles, relationships, stories, scenes, prose, plot,
        timeline moments, world rules and - if you own this universe - your ideas to Pending AI
        Changes in LoreX, as you. Removals only go to the Trash. Nothing changes until you, or the
        universe&rsquo;s owner or an Editor, approves it there. You can turn this off in Connected
        apps.
      </p>
      {details.canProposeSchema ? (
        <>
          <div className="consent__check">
            <input
              id="consent-schema"
              type="checkbox"
              name={SCHEMA_FIELD}
              value="allow"
              disabled={!proposing}
              aria-describedby="consent-schema-what"
              data-testid="consent-schema"
            />
            <label htmlFor="consent-schema">
              Also let it propose new lore types, fields and groups
            </label>
          </div>
          <p className="consent__identity" id="consent-schema-what">
            Schema changes how every entry of a type is shaped, so it is a separate choice. They
            arrive in their own proposal, are reviewed and approved like any other change, and are
            never deleted by the app: a field is only ever archived.
          </p>
        </>
      ) : null}
    </section>
  )
}

function roleWords(role: UniverseRoleValue) {
  if (role === UniverseRole.Owner) return 'the owner'
  return role === UniverseRole.Editor ? 'an Editor' : `a ${ROLE_LABELS[role]}`
}
