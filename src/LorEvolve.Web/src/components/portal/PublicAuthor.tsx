import { useCallback } from 'react'
import { Avatar } from '../Avatar'
import { ShowMore } from '../ShowMore'
import { listPublicUniverses, type PublicAuthor, type PublicUniverse } from '../../portal/api'
import { usePublicPages } from '../../portal/usePublicPages'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useI18n } from '../../i18n'
import { formatCount } from '../../i18n/format'
import { WorldGrid } from './WorldGrid'

/** An author's public page: their name and photo, then their public worlds. Split from `PublicAuthorPage`. */
export function Author({ author }: { author: PublicAuthor }) {
  const { t, tn } = useI18n()
  useDocumentTitle(author.displayName)
  const fetchWorlds = useCallback(
    (page: number, signal: AbortSignal) =>
      listPublicUniverses({ author: author.slug }, page, signal),
    [author.slug],
  )
  const worlds = usePublicPages<PublicUniverse>(author.slug, fetchWorlds)

  return (
    <div className="pauthor" data-testid="public-author">
      <header className="pauthor__head">
        <span className="pauthor__avatar" aria-hidden="true">
          <Avatar
            src={author.avatarUrl}
            name={author.displayName}
            className="pauthor__photo"
            testId="public-author-avatar"
          />
        </span>
        <div className="pauthor__text">
          <p className="pread__eyebrow">{t('portal.author.eyebrow')}</p>
          <h1 className="pauthor__name" dir="auto">
            <bdi>{author.displayName}</bdi>
          </h1>
          {worlds.status === 'ready' ? (
            <p className="pauthor__count" data-testid="public-author-count">
              {tn('portal.author.count', worlds.totalCount, { n: formatCount(worlds.totalCount) })}
            </p>
          ) : null}
        </div>
      </header>

      <section className="pauthor__worlds" aria-labelledby="author-worlds-heading">
        <h2 className="pworld__heading" id="author-worlds-heading">
          {t('portal.author.worldsHeading')}
        </h2>
        {worlds.status === 'error' ? (
          <div className="pworld__empty" role="alert">
            <p>{t('portal.author.loadFailed')}</p>
            <button className="portal__pill" type="button" onClick={worlds.retry}>
              {t('portal.author.retry')}
            </button>
          </div>
        ) : worlds.status === 'loading' ? (
          <p className="pworld__status" role="status">
            {t('portal.author.loading')}
          </p>
        ) : (
          <WorldGrid worlds={worlds.items} linkAuthor={false} testId="public-author-worlds" />
        )}
        <ShowMore hasMore={worlds.hasMore} status={worlds.more} onMore={worlds.showMore} />
      </section>
    </div>
  )
}
