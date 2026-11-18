import { useI18n } from '../../i18n'
import type { usePublicPages } from '../../portal/usePublicPages'

/** Message keys, not text: the labels are looked up in render. */
const MORE_KEYS = {
  lore: {
    error: 'portal.world.loreMore.error',
    loading: 'portal.world.loreMore.loading',
    retry: 'portal.world.loreMore.retry',
    show: 'portal.world.loreMore.show',
  },
  stories: {
    error: 'portal.world.storiesMore.error',
    loading: 'portal.world.storiesMore.loading',
    retry: 'portal.world.storiesMore.retry',
    show: 'portal.world.storiesMore.show',
  },
} as const

export function More({
  pages,
  kind,
  testId,
}: {
  pages: ReturnType<typeof usePublicPages<{ slug: string }>>
  kind: 'lore' | 'stories'
  testId: string
}) {
  const { t } = useI18n()
  const labels = MORE_KEYS[kind]
  if (!pages.hasMore) return null
  return (
    <div className="pworld__more">
      {pages.more === 'error' ? (
        <p className="explore__more-error" role="alert">
          {t(labels.error)}
        </p>
      ) : null}
      <button
        className="portal__pill"
        type="button"
        onClick={pages.showMore}
        disabled={pages.more === 'loading'}
        aria-busy={pages.more === 'loading'}
        data-testid={testId}
      >
        {pages.more === 'loading'
          ? t(labels.loading)
          : pages.more === 'error'
            ? t(labels.retry)
            : t(labels.show)}
      </button>
      <p className="pworld__shown" role="status">
        {t('portal.world.shown', { shown: pages.items.length, total: pages.totalCount })}
      </p>
    </div>
  )
}
