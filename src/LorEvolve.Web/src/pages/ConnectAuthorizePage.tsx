import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { MAIN_CONTENT_ID } from '../components/SkipLink'
import { Wordmark } from '../components/Wordmark'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import {
  describeConnectionRequest,
  getConsentToken,
  PROPOSE_FIELD,
  readable,
  type ConnectionRequestDetails,
  type ConsentToken,
} from '../mcp/api'
import { UniverseRole, type UniverseRoleValue } from '../universes/types'
import { useI18n } from '../i18n'

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; details: ConnectionRequestDetails }
  | { kind: 'invalid' }
  | { kind: 'no-access' }
  | { kind: 'error' }

/** The field the decision travels in, beside the request's own parameters. Read by `OAuthEndpoints` on the server. */
const DECISION_FIELD = 'lorevolve_decision'

/**
 * The consent screen (ADR 0046). An AI app sent the browser to LorEvolve's authorization endpoint, which validated the
 * request and handed it here unchanged, in the address. This screen shows who is asking and for which universe, and
 * posts the same parameters back with the person's decision and the antiforgery token it read for this account - a
 * same-site post that carries the session, which the server validates all over again before anything is approved. A post
 * without that token, however it rides the session, is sent back here. Approve and Deny are the only ways on; nothing is ever
 * approved without one of them being pressed.
 */
export default function ConnectAuthorizePage() {
  const { t, tx } = useI18n()
  const { search } = useLocation()
  const { user } = useAuth()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [deciding, setDeciding] = useState(false)
  const [token, setToken] = useState<ConsentToken | null>(null)
  const submitted = useRef(false)
  const detailsId = useId()

  useDocumentTitle(t('universe.connect.title'))

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
            {deciding ? t('universe.connect.connecting') : t('universe.connect.approve')}
          </button>
        ) : null}
        <button
          className="button button--secondary"
          type="submit"
          name={DECISION_FIELD}
          value="deny"
          data-testid="consent-deny"
        >
          {load.kind === 'ready' ? t('universe.connect.deny') : t('universe.connect.goBack')}
        </button>
      </div>
    </form>
  )

  // A request to decide on, or one to turn down: either way the decision waits for the antiforgery token.
  const request =
    load.kind === 'no-access' ? (
      <div className="notice notice--error" role="alert" data-testid="consent-no-access">
        <p>{t('universe.connect.noAccount')}</p>
        <p>{t('universe.connect.noAccountNote')}</p>
      </div>
    ) : load.kind === 'ready' ? (
      <ConsentDetails details={load.details} id={detailsId} />
    ) : null

  return (
    <ConsentLayout
      heading={t('universe.connect.heading')}
      intro={
        // The gist, above the fold even when the warnings below are long (issue 38): read-only, manuscripts included,
        // and where the content goes. The full list and notes follow unchanged.
        <>
          {tx(
            load.kind === 'ready' && load.details.proposalsRequested && load.details.canPropose
              ? 'universe.connect.introProposals'
              : 'universe.connect.intro',
            { readOnly: <strong>{t('universe.connect.introReadOnly')}</strong> },
          )}
        </>
      }
      footer={
        user ? (
          <>
            {tx('universe.connect.signedIn', {
              name: <bdi>{user.username}</bdi>,
              link: (
                <Link to="/app/profile?tab=connected-apps#connected-apps">
                  {t('universe.connect.connectedApps')}
                </Link>
              ),
            })}
          </>
        ) : null
      }
    >
      {load.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('universe.connect.checking')}
        </p>
      ) : load.kind === 'invalid' ? (
        // An app or a return address LorEvolve does not recognise: there is nowhere trusted to send the browser back to.
        <div className="notice notice--error" role="alert" data-testid="consent-invalid">
          <p>{t('universe.connect.invalid')}</p>
          <p>{t('universe.connect.invalidNote')}</p>
        </div>
      ) : load.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="consent-error">
          <p>{t('universe.connect.checkFailed')}</p>
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
  const { t } = useI18n()

  return (
    <div className="consent-page">
      <main className="consent-card" id={MAIN_CONTENT_ID} tabIndex={-1} data-testid="consent-card">
        <Link
          className="consent-card__brand"
          to="/"
          aria-label={t('shell.brand.homeLabel')}
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
  const { t, tx } = useI18n()

  return (
    <div className="consent" id={id} data-testid="consent-details">
      <section className="consent__part" aria-label={t('universe.connect.appSection')}>
        <p className="consent__label">{t('universe.connect.appLabel')}</p>
        <p className="consent__app" data-testid="consent-app">
          <bdi>{details.clientName}</bdi>
        </p>
        {details.verifiedHost ? (
          <p className="consent__identity" data-testid="consent-verified">
            {tx('universe.connect.verified', { host: <strong>{details.verifiedHost}</strong> })}
          </p>
        ) : (
          <p className="callout callout--warning consent__warning" data-testid="consent-unverified">
            {t('universe.connect.unverified')}
          </p>
        )}
        <p className="consent__identity" data-testid="consent-return">
          {tx('universe.connect.returnTo', { host: <strong>{details.redirectHost}</strong> })}
        </p>
        {details.loopbackOnly ? (
          <p className="callout callout--warning consent__warning" data-testid="consent-loopback">
            {t('universe.connect.loopback')}
          </p>
        ) : null}
      </section>

      <section className="consent__part" aria-label={t('universe.connect.universeSection')}>
        <p className="consent__label">{t('universe.connect.universeLabel')}</p>
        <p className="consent__universe" data-testid="consent-universe">
          <bdi>{details.universeName}</bdi>
        </p>
        <p className="consent__identity">
          {t(`universe.connect.youAre.${ROLE_SENTENCES[details.role]}`)}
        </p>
      </section>

      <section className="consent__part" aria-label={t('universe.connect.canDoSection')}>
        <p className="consent__label">{t('universe.connect.readOnlyAccess')}</p>
        <ul className="consent__list" data-testid="consent-scope">
          {readable().map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="consent__identity">{t('universe.connect.cannotWrite')}</p>
      </section>

      {details.proposalsRequested ? <ProposalChoice details={details} /> : null}

      <section
        className="consent__part consent__part--notes"
        aria-label={t('universe.connect.notesSection')}
      >
        <p className="settings__note">{t('universe.connect.noteService')}</p>
        <p className="settings__note">{t('universe.connect.noteStays')}</p>
      </section>
    </div>
  )
}

/**
 * What the app may do, as one of two levels, offered only when the app asked to propose and the role could allow it:
 * Reader, the default, or Creator, which proposes changes of every kind the role allows - lore, types and fields included
 * (ADR 0047, ADR 0062). Proposing is not writing: what the app sends waits in Pending AI Changes.
 */
function ProposalChoice({ details }: { details: ConnectionRequestDetails }) {
  const { t, tx } = useI18n()

  if (!details.canPropose) {
    return (
      <section className="consent__part" aria-label={t('universe.connect.levelSection')}>
        <p className="consent__identity" data-testid="consent-propose-unavailable">
          {t('universe.connect.proposeUnavailable')}
        </p>
      </section>
    )
  }

  return (
    <fieldset className="consent__part consent__propose" aria-describedby="consent-propose-what">
      <legend className="consent__label">{t('universe.connect.level')}</legend>
      <div className="consent__check">
        <input
          id="consent-reader"
          type="radio"
          name={PROPOSE_FIELD}
          value="read"
          defaultChecked
          data-testid="consent-reader"
        />
        <label htmlFor="consent-reader">
          {tx('universe.connect.levelReader', {
            level: <strong>{t('universe.connect.levelReaderName')}</strong>,
            app: <bdi>{details.clientName}</bdi>,
          })}
        </label>
      </div>
      <div className="consent__check">
        <input
          id="consent-propose"
          type="radio"
          name={PROPOSE_FIELD}
          value="allow"
          data-testid="consent-propose"
        />
        <label htmlFor="consent-propose">
          {tx('universe.connect.levelCreator', {
            level: <strong>{t('universe.connect.levelCreatorName')}</strong>,
          })}
        </label>
      </div>
      <p className="consent__identity" id="consent-propose-what">
        {details.canProposeSchema
          ? t('universe.connect.creatorCanSchema')
          : t('universe.connect.creatorCan')}
      </p>
    </fieldset>
  )
}

/**
 * Each role gets its own whole sentence: "the owner", "an Editor", "a Reviewer" are an article glued to a noun, which
 * no other language can follow, so nothing here is assembled from pieces.
 */
const ROLE_SENTENCES = {
  [UniverseRole.Owner]: 'owner',
  [UniverseRole.Editor]: 'editor',
  [UniverseRole.Reviewer]: 'reviewer',
  [UniverseRole.Viewer]: 'viewer',
} as const satisfies Record<UniverseRoleValue, string>
