import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, BookOpen, ScrollText } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { WorldAttribution } from '../components/WorldAttribution'
import {
  getPublicUniverse,
  listPublicLore,
  listPublicStories,
  lorePath,
  storyPath,
  type PublicLoreEntry,
  type PublicStory,
  type PublicUniverse,
} from '../portal/api'
import { usePublicPages } from '../portal/usePublicPages'
import { useWorkspaceLink } from '../portal/useWorkspaceLink'
import { categoryLabel, genreKey, genreLabel } from '../publishing/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type LoadState =
  | { slug: string; kind: 'ready'; world: PublicUniverse }
  | { slug: string; kind: 'missing' }
  | { slug: string; kind: 'error' }

/**
 * One public universe at `/worlds/{slug}` (Task 011): where an Explore card leads. The author's artwork behind a
 * cinematic hero - the public 16:10 card, drawn crisp at no more than its own width and, blurred, as the backdrop, so
 * nothing is enlarged into softness and the private original is never needed - with the name, the author, what kind of
 * world it is and its public summary. Under it, what the author published inside it: lore, then stories, each a page at
 * a time with Show more.
 *
 * Only what is public, and nothing about what is not: a section with nothing published is left out, one with nothing
 * at all says so plainly, and no count of anything private exists to show. Private and missing worlds are the same
 * page. The owner, signed in, gets one quiet way back to the workspace; nobody else learns who the owner is.
 */
export default function PublicWorldPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getPublicUniverse(slug, controller.signal)
      .then((world) => setState({ slug, kind: 'ready', world }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          slug,
          kind: (error as { status?: number }).status === 404 ? 'missing' : 'error',
        })
      })
    return () => {
      controller.abort()
    }
  }, [slug, attempt])

  const current = state?.slug === slug ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title="This world is not available." testId="world-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pworld pworld--loading" role="status" aria-label="Opening this world">
        <div className="pworld-hero pworld-hero--skeleton" />
      </div>
    )
  }

  return <World world={current.world} />
}

function World({ world }: { world: PublicUniverse }) {
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
        <img className="pworld-hero__backdrop" src={world.cardImageUrl} alt="" aria-hidden="true" />
        <div className="pworld-hero__inner">
          <div className="pworld-hero__text">
            <p className="pworld-hero__eyebrow" data-testid="public-world-category">
              {categoryLabel(world.category)}
            </p>
            <h1 className="pworld-hero__title" dir="auto">
              <bdi>{world.name}</bdi>
            </h1>
            <WorldAttribution world={world} className="pworld-hero__byline" testId="public-world" />
            <ul className="worldcard__genres pworld-hero__genres" aria-label="Genres">
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
                Edit this world
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
          <nav className="pworld__nav" aria-label="In this world">
            <a className="pworld__navlink" href="#lore">
              Lore
            </a>
            <a className="pworld__navlink" href="#stories">
              Stories
            </a>
          </nav>
        ) : null}

        {lore.status === 'loading' || stories.status === 'loading' ? (
          <p className="pworld__status" role="status">
            Opening what is published here…
          </p>
        ) : null}

        {hasLore ? (
          <section className="pworld__section" id="lore" aria-labelledby="lore-heading">
            <h2 className="pworld__heading" id="lore-heading">
              <ScrollText aria-hidden="true" size={20} strokeWidth={1.5} />
              Lore
            </h2>
            <ul className="plore-grid" data-testid="public-lore-list">
              {lore.items.map((entry) => (
                <LoreCard key={entry.slug} world={world.slug} entry={entry} />
              ))}
            </ul>
            <More pages={lore} noun="lore" testId="public-lore-more" />
          </section>
        ) : null}

        {hasStories ? (
          <section className="pworld__section" id="stories" aria-labelledby="stories-heading">
            <h2 className="pworld__heading" id="stories-heading">
              <BookOpen aria-hidden="true" size={20} strokeWidth={1.5} />
              Stories
            </h2>
            <ul className="pstory-grid" data-testid="public-story-list">
              {stories.items.map((story) => (
                <StoryCard key={story.slug} world={world.slug} story={story} />
              ))}
            </ul>
            <More pages={stories} noun="stories" testId="public-story-more" />
          </section>
        ) : null}

        {lore.status === 'error' || stories.status === 'error' ? (
          <div className="pworld__empty" role="alert">
            <p>What is published here could not be loaded.</p>
            <button
              className="portal__pill"
              type="button"
              onClick={() => {
                if (lore.status === 'error') lore.retry()
                if (stories.status === 'error') stories.retry()
              }}
            >
              Try again
            </button>
          </div>
        ) : settled && !hasLore && !hasStories ? (
          <div className="pworld__empty" data-testid="public-world-empty">
            <BrandMark className="pworld__emptymark" />
            <p>No lore or stories have been published here yet.</p>
          </div>
        ) : null}
      </div>
    </article>
  )
}

function LoreCard({ world, entry }: { world: string; entry: PublicLoreEntry }) {
  return (
    <li className="plorecard">
      <Link className="plorecard__link" to={lorePath(world, entry.slug)}>
        <span className="plorecard__thumb" aria-hidden="true">
          {entry.thumbnailUrl ? (
            <img
              src={entry.thumbnailUrl}
              alt=""
              width={320}
              height={320}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="plorecard__initial">{initial(entry.name)}</span>
          )}
        </span>
        <span className="plorecard__text">
          <span className="plorecard__type">{entry.typeName}</span>
          <span className="plorecard__name" dir="auto">
            <bdi>{entry.name}</bdi>
          </span>
          {entry.summary ? (
            <span className="plorecard__summary" dir="auto">
              {entry.summary}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function StoryCard({ world, story }: { world: string; story: PublicStory }) {
  return (
    <li className="pstorycard">
      <Link className="pstorycard__link" to={storyPath(world, story.slug)}>
        <span className="pstorycard__title" dir="auto">
          <bdi>{story.title}</bdi>
        </span>
        <span className="pstorycard__summary" dir="auto">
          {story.publicSummary}
        </span>
        <span className="pstorycard__cta" aria-hidden="true">
          Read about this story →
        </span>
      </Link>
    </li>
  )
}

function More({
  pages,
  noun,
  testId,
}: {
  pages: ReturnType<typeof usePublicPages<{ slug: string }>>
  noun: string
  testId: string
}) {
  if (!pages.hasMore) return null
  return (
    <div className="pworld__more">
      {pages.more === 'error' ? (
        <p className="explore__more-error" role="alert">
          More {noun} could not be loaded.
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
          ? 'Loading…'
          : pages.more === 'error'
            ? 'Try again'
            : `Show more ${noun}`}
      </button>
      <p className="pworld__shown" role="status">
        Showing {pages.items.length} of {pages.totalCount}
      </p>
    </div>
  )
}

/** The first letter of a name, for an entry with no picture: a mark, never a made-up image. */
function initial(name: string) {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '·'
}
