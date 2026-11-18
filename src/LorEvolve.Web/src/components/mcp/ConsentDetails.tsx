import { readable, type ConnectionRequestDetails } from '../../mcp/api'
import { UniverseRole, type UniverseRoleValue } from '../../universes/types'
import { useI18n } from '../../i18n'
import { ProposalChoice } from './ProposalChoice'

export function ConsentDetails({ details, id }: { details: ConnectionRequestDetails; id: string }) {
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
 * Each role gets its own whole sentence: "the owner", "an Editor", "a Reviewer" are an article glued to a noun, which
 * no other language can follow, so nothing here is assembled from pieces.
 */
const ROLE_SENTENCES = {
  [UniverseRole.Owner]: 'owner',
  [UniverseRole.Editor]: 'editor',
  [UniverseRole.Reviewer]: 'reviewer',
  [UniverseRole.Viewer]: 'viewer',
} as const satisfies Record<UniverseRoleValue, string>
