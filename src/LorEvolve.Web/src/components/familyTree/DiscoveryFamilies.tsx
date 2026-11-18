import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { FamilyDiscoveryPage } from '../../familyTree/types'
import { useI18n } from '../../i18n'
import { DiscoveryPager } from './DiscoveryPager'
import type { useDiscoveryState } from '../../familyTree/useDiscoveryState'
import type { FamiliesReturn } from '../FamilyDiscovery'
import { Button } from '../Button'

export function DiscoveryFamilies({
  universeId,
  headingId,
  headingRef,
  q,
  state,
  result,
  isCurrent,
  setReads,
  returnTo,
  goToPage,
}: Pick<ReturnType<typeof useDiscoveryState>, 'headingId' | 'headingRef' | 'state' | 'setReads'> & {
  universeId: string
  q: string
  result: FamilyDiscoveryPage | null
  isCurrent: boolean
  returnTo: FamiliesReturn
  goToPage: (next: number) => void
}) {
  const { t, tn } = useI18n()

  return (
    <section className="discovery__families" aria-labelledby={headingId}>
      <div className="discovery__head">
        <h2 className="settings__heading" id={headingId} ref={headingRef} tabIndex={-1}>
          {t('places.discovery.heading')}
        </h2>
        {result ? (
          <p className="discovery__count" role="status" data-testid="family-count">
            {result.totalCount === 0
              ? t('places.discovery.noMatch')
              : q
                ? tn('places.discovery.matches', result.totalCount, {
                    n: result.totalCount,
                    q,
                  })
                : tn('places.discovery.count', result.totalCount, { n: result.totalCount })}
          </p>
        ) : null}
      </div>

      {state.kind === 'loading' && !result ? (
        <p className="notice" role="status">
          {t('places.discovery.finding')}
        </p>
      ) : null}

      {state.kind === 'error' && isCurrent ? (
        <div className="notice notice--error" role="alert" data-testid="family-discovery-error">
          <p>{t('places.discovery.error')}</p>
          <Button tone="secondary" onClick={() => setReads((current) => current + 1)}>
            {t('places.discovery.retry')}
          </Button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="discovery__list" aria-busy={!isCurrent} data-testid="family-list">
          {result.items.map((family) => (
            <li key={family.focusEntityId}>
              <Link
                className="familycard"
                to={`/app/universes/${universeId}/family-tree/${family.focusEntityId}`}
                state={returnTo}
                data-testid="family-card"
              >
                <span className="familycard__names">
                  {family.previewMembers.map((member, index) => (
                    <span key={member.entityId}>
                      {index > 0 ? ', ' : null}
                      <bdi>{member.name}</bdi>
                    </span>
                  ))}
                </span>
                <span className="familycard__count" data-testid="family-card-count">
                  {tn('places.discovery.members', family.memberCount, {
                    n: family.memberCount,
                  })}
                </span>
                <ChevronRight
                  className="familycard__chevron"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.totalPages > 1 ? (
        <DiscoveryPager result={result} goToPage={goToPage} />
      ) : null}
    </section>
  )
}
