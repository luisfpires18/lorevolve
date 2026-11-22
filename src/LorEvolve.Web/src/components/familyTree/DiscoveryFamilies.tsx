import { CardGrid } from '../CardGrid'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { FamilyDiscoveryPage } from '../../familyTree/types'
import { useI18n } from '../../i18n'
import { Pager } from '../Pager'
import type { useDiscoveryState } from '../../familyTree/useDiscoveryState'
import type { FamiliesReturn } from '../FamilyDiscovery'
import { ReadGate } from '../ReadGate'
import type { Load } from '../../lib/useAsyncRead'
import { QuietNote } from '../QuietNote'
import { SectionTitle } from '../Section'
import { formatCount } from '../../i18n/format'

export function DiscoveryFamilies({
  universeId,
  headingId,
  headingRef,
  q,
  state,
  result,
  isCurrent,
  retry,
  returnTo,
  goToPage,
}: Pick<ReturnType<typeof useDiscoveryState>, 'headingId' | 'headingRef'> & {
  universeId: string
  state: Load<FamilyDiscoveryPage>
  retry: () => void
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
        <SectionTitle id={headingId} ref={headingRef} tabIndex={-1}>
          {t('places.discovery.heading')}
        </SectionTitle>
        {result ? (
          <QuietNote className="discovery__count" wrap testId="family-count" role="status">
            {result.totalCount === 0
              ? t('places.discovery.noMatch')
              : q
                ? tn('places.discovery.matches', result.totalCount, {
                    n: formatCount(result.totalCount),
                    q,
                  })
                : tn('places.discovery.count', result.totalCount, {
                    n: formatCount(result.totalCount),
                  })}
          </QuietNote>
        ) : null}
      </div>

      {/* A failure for a search or page already left behind is not said; the list is drawn below. */}
      {state.kind !== 'error' || isCurrent ? (
        <ReadGate
          load={state}
          loading={{ text: t('places.discovery.finding') }}
          error={{
            message: t('places.discovery.error'),
            onRetry: retry,
            retryLabel: t('places.discovery.retry'),
            testId: 'family-discovery-error',
          }}
        >
          {() => null}
        </ReadGate>
      ) : null}

      {result && result.items.length > 0 ? (
        <CardGrid
          min={17}
          gap={3}
          className="discovery__list"
          aria-busy={!isCurrent}
          testId="family-list"
        >
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
        </CardGrid>
      ) : null}

      {result ? (
        <Pager
          page={result.page}
          totalPages={result.totalPages}
          onPage={goToPage}
          testId="family-pager"
        />
      ) : null}
    </section>
  )
}
