import { PROPOSE_FIELD, type ConnectionRequestDetails } from '../../mcp/api'
import { useI18n } from '../../i18n'

/**
 * What the app may do, as one of two levels, offered only when the app asked to propose and the role could allow it:
 * Reader, the default, or Creator, which proposes changes of every kind the role allows - lore, types and fields included
 * (ADR 0047, ADR 0062). Proposing is not writing: what the app sends waits in Pending AI Changes.
 */
export function ProposalChoice({ details }: { details: ConnectionRequestDetails }) {
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
