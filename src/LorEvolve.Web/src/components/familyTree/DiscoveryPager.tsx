import type { FamilyDiscoveryPage } from '../../familyTree/types'
import { useI18n } from '../../i18n'

export function DiscoveryPager({
  result,
  goToPage,
}: {
  result: FamilyDiscoveryPage
  goToPage: (next: number) => void
}) {
  const { t } = useI18n()

  return (
    <nav className="pager" aria-label={t('places.discovery.pages')}>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page <= 1}
        onClick={() => goToPage(result.page - 1)}
      >
        {t('places.discovery.previous')}
      </button>
      <span className="pager__position">
        {t('places.discovery.position', { page: result.page, total: result.totalPages })}
      </span>
      <button
        className="button button--secondary"
        type="button"
        disabled={result.page >= result.totalPages}
        onClick={() => goToPage(result.page + 1)}
        data-testid="family-next-page"
      >
        {t('places.discovery.next')}
      </button>
    </nav>
  )
}
