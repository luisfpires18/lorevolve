import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { WorldCard } from '../components/WorldCard'
import {
  getPublicAuthor,
  listPublicUniverses,
  type PublicAuthor,
  type PublicUniverse,
} from '../portal/api'
import { usePublicPages } from '../portal/usePublicPages'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type LoadState =
  | { slug: string; kind: 'ready'; author: PublicAuthor }
  | { slug: string; kind: 'missing' }
  | { slug: string; kind: 'error' }

/**
 * An author's public page at `/authors/{slug}` (ADR 0037): a creator inside the portal, not an account. Their public
 * name, their photo only if they chose to show it - otherwise the first letter of their name in a ring, never an
 * invented face - and their public worlds, as the same cards Explore draws. No email, username, account id, private
 * world or setting, and no counts of anything but what is public.
 *
 * An author exists publicly only while they have a public world: otherwise this is the same page as an address nobody
 * holds. The workspace's own Profile is a different thing, and stays in the workspace.
 */
export default function PublicAuthorPage() {
  const { authorSlug = '' } = useParams<{ authorSlug: string }>()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getPublicAuthor(authorSlug, controller.signal)
      .then((author) => setState({ slug: authorSlug, kind: 'ready', author }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          slug: authorSlug,
          kind: (error as { status?: number }).status === 404 ? 'missing' : 'error',
        })
      })
    return () => {
      controller.abort()
    }
  }, [authorSlug, attempt])

  const current = state?.slug === authorSlug ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title="This author is not available." testId="author-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pauthor" role="status" aria-label="Opening this author">
        <div className="pauthor__head pauthor__head--skeleton" />
      </div>
    )
  }

  return <Author author={current.author} />
}

function Author({ author }: { author: PublicAuthor }) {
  useDocumentTitle(author.displayName)
  const fetchWorlds = useCallback(
    (page: number, signal: AbortSignal) =>
      listPublicUniverses({ author: author.slug }, page, signal),
    [author.slug],
  )
  const worlds = usePublicPages<PublicUniverse>(author.slug, fetchWorlds)
  const [photoFailed, setPhotoFailed] = useState(false)

  return (
    <div className="pauthor" data-testid="public-author">
      <header className="pauthor__head">
        <span className="pauthor__avatar" aria-hidden="true">
          {author.avatarUrl && !photoFailed ? (
            <img
              src={author.avatarUrl}
              alt=""
              width={320}
              height={320}
              decoding="async"
              onError={() => setPhotoFailed(true)}
              data-testid="public-author-avatar"
            />
          ) : (
            <span className="pauthor__initial" data-testid="public-author-placeholder">
              {Array.from(author.displayName.trim())[0]?.toLocaleUpperCase() ?? '·'}
            </span>
          )}
        </span>
        <div className="pauthor__text">
          <p className="pread__eyebrow">Creator on LorEvolve</p>
          <h1 className="pauthor__name" dir="auto">
            <bdi>{author.displayName}</bdi>
          </h1>
          {worlds.status === 'ready' ? (
            <p className="pauthor__count" data-testid="public-author-count">
              {worlds.totalCount === 1
                ? '1 published world'
                : `${worlds.totalCount} published worlds`}
            </p>
          ) : null}
        </div>
      </header>

      <section className="pauthor__worlds" aria-labelledby="author-worlds-heading">
        <h2 className="pworld__heading" id="author-worlds-heading">
          Worlds
        </h2>
        {worlds.status === 'error' ? (
          <div className="pworld__empty" role="alert">
            <p>These worlds could not be loaded.</p>
            <button className="portal__pill" type="button" onClick={worlds.retry}>
              Try again
            </button>
          </div>
        ) : worlds.status === 'loading' ? (
          <p className="pworld__status" role="status">
            Opening their worlds…
          </p>
        ) : (
          <ul className="explore-grid" data-testid="public-author-worlds">
            {worlds.items.map((world) => (
              <WorldCard key={world.slug} world={world} linkAuthor={false} />
            ))}
          </ul>
        )}
        {worlds.hasMore ? (
          <div className="pworld__more">
            <button
              className="portal__pill"
              type="button"
              onClick={worlds.showMore}
              disabled={worlds.more === 'loading'}
              aria-busy={worlds.more === 'loading'}
            >
              {worlds.more === 'loading' ? 'Loading…' : 'Show more worlds'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
