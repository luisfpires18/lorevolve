import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, BookOpen, ScrollText } from 'lucide-react'
import { BrandMark } from '../BrandMark'
import { WorldAttribution } from '../WorldAttribution'
import {
  listPublicLore,
  listPublicStories,
  type PublicLoreEntry,
  type PublicStory,
  type PublicUniverse,
} from '../../portal/api'
import { usePublicPages } from '../../portal/usePublicPages'
import { useWorkspaceLink } from '../../portal/useWorkspaceLink'
import { categoryLabel, genreKey, genreLabel } from '../../publishing/types'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useI18n } from '../../i18n'
import { LoreCard } from './LoreCard'
import { ShowMore } from '../ShowMore'
import { StoryCard } from './StoryCard'

export function World({ world }: { world: PublicUniverse }) {
  const { t } = useI18n()
  useDocumentTitle(world.name)
  const owner = useWorkspaceLink(world.slug)
  const fetchLore = useCallback(
    (page: number, signal: AbortSignal) => listPublicLore(world.slug, page, signal),
    [world.slug],
  )
  const fetchStories = useCallback(
    (page: number, signal: AbortSignal) => listPublicStories(world.slug, page, signal),
    [world.slug],
  )
  const lore = usePublicPages<PublicLoreEntry>(world.slug, fetchLore)
  const stories = usePublicPages<PublicStory>(world.slug, fetchStories)

  const settled = lore.status !== 'loading' && stories.status !== 'loading'
  const hasLore = lore.items.length > 0
  const hasStories = stories.items.length > 0

  return (
    <article className="pworld" data-testid="public-world">
      <header className="pworld-hero">
        <img
          className="pworld-hero__backdrop"
          src={world.cardImageUrl}
          alt=""
          aria-hidden="true"
          decoding="async"
        />
        <div className="pworld-hero__inner">
          <div className="pworld-hero__text">
            <p className="pworld-hero__eyebrow" data-testid="public-world-category">
              {categoryLabel(world.category)}
            </p>
            <h1 className="pworld-hero__title" dir="auto">
              <bdi>{world.name}</bdi>
            </h1>
            <WorldAttribution world={world} className="pworld-hero__byline" testId="public-world" />
            <ul
              className="worldcard__genres pworld-hero__genres"
              aria-label={t('portal.world.genres')}
            >
              {world.genres.map((genre) => (
                <li className="genrechip" data-genre={genreKey(genre)} key={genre}>
                  {genreLabel(genre)}
                </li>
              ))}
            </ul>
            <p className="pworld-hero__summary" dir="auto" data-testid="public-world-summary">
              {world.publicSummary}
            </p>
            {owner ? (
              <Link
                className="portal__pill pworld-hero__edit"
                to={`/app/universes/${owner.universeId}`}
                data-testid="edit-this-world"
              >
                {t('portal.world.edit')}
                <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.75} />
              </Link>
            ) : null}
          </div>
          <figure className="pworld-hero__art">
            <img
              src={world.cardImageUrl}
              alt=""
              width={960}
              height={600}
              fetchPriority="high"
              decoding="async"
              data-testid="public-world-card"
            />
          </figure>
        </div>
      </header>

      <div className="pworld__body">
        {settled && hasLore && hasStories ? (
          <nav className="pworld__nav" aria-label={t('portal.world.nav')}>
            <a className="pworld__navlink" href="#lore">
              {t('portal.world.navLore')}
            </a>
            <a className="pworld__navlink" href="#stories">
              {t('portal.world.navStories')}
            </a>
          </nav>
        ) : null}

        {lore.status === 'loading' || stories.status === 'loading' ? (
          <p className="pworld__status" role="status">
            {t('portal.world.loading')}
          </p>
        ) : null}

        {hasLore ? (
          <section className="pworld__section" id="lore" aria-labelledby="lore-heading">
            <h2 className="pworld__heading" id="lore-heading">
              <ScrollText aria-hidden="true" size={20} strokeWidth={1.75} />
              {t('portal.world.loreHeading')}
            </h2>
            <ul className="plore-grid" data-testid="public-lore-list">
              {lore.items.map((entry) => (
                <LoreCard key={entry.slug} world={world.slug} entry={entry} />
              ))}
            </ul>
            <ShowMore
              hasMore={lore.hasMore}
              status={lore.more}
              onMore={lore.showMore}
              shown={lore.items.length}
              total={lore.totalCount}
              testId="public-lore-more"
            />
          </section>
        ) : null}

        {hasStories ? (
          <section className="pworld__section" id="stories" aria-labelledby="stories-heading">
            <h2 className="pworld__heading" id="stories-heading">
              <BookOpen aria-hidden="true" size={20} strokeWidth={1.75} />
              {t('portal.world.storiesHeading')}
            </h2>
            <ul className="pstory-grid" data-testid="public-story-list">
              {stories.items.map((story) => (
                <StoryCard key={story.slug} world={world.slug} story={story} />
              ))}
            </ul>
            <ShowMore
              hasMore={stories.hasMore}
              status={stories.more}
              onMore={stories.showMore}
              shown={stories.items.length}
              total={stories.totalCount}
              testId="public-story-more"
            />
          </section>
        ) : null}

        {lore.status === 'error' || stories.status === 'error' ? (
          <div className="pworld__empty" role="alert">
            <p>{t('portal.world.loadFailed')}</p>
            <button
              className="portal__pill"
              type="button"
              onClick={() => {
                if (lore.status === 'error') lore.retry()
                if (stories.status === 'error') stories.retry()
              }}
            >
              {t('portal.world.retry')}
            </button>
          </div>
        ) : settled && !hasLore && !hasStories ? (
          <div className="pworld__empty" data-testid="public-world-empty">
            <BrandMark className="pworld__emptymark" />
            <p>{t('portal.world.empty')}</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}
