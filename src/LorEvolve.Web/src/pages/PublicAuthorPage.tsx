import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { Avatar } from '../components/Avatar'
import { WorldCard } from '../components/WorldCard'
import { ShowMore } from '../components/ShowMore'
import {
  getPublicAuthor,
  listPublicUniverses,
  type PublicAuthor,
  type PublicUniverse,
} from '../portal/api'
import { usePublicPages } from '../portal/usePublicPages'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useI18n } from '../i18n'
import { formatCount } from '../i18n/format'

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
  const { t } = useI18n()
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
    return <PortalMissing title={t('portal.author.missing')} testId="author-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pauthor" role="status" aria-label={t('portal.author.opening')}>
        <div className="pauthor__head pskeleton pskeleton--author" />
      </div>
    )
  }

  return <Author author={current.author} />
}

function Author({ author }: { author: PublicAuthor }) {
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
          <ul className="explore-grid" data-testid="public-author-worlds">
            {worlds.items.map((world) => (
              <WorldCard key={world.slug} world={world} linkAuthor={false} />
            ))}
          </ul>
        )}
        <ShowMore hasMore={worlds.hasMore} status={worlds.more} onMore={worlds.showMore} />
      </section>
    </div>
  )
}
