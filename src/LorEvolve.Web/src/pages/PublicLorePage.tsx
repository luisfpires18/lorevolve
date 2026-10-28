import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { LoreArticle } from '../components/LoreEditor'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import {
  getPublicLore,
  getPublicUniverse,
  worldPath,
  type PublicLoreDetail,
  type PublicUniverse,
} from '../portal/api'
import { useWorkspaceLink } from '../portal/useWorkspaceLink'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type LoadState =
  | { key: string; kind: 'ready'; world: PublicUniverse; entry: PublicLoreDetail }
  | { key: string; kind: 'missing' }
  | { key: string; kind: 'error' }

/**
 * One published lore entry at `/worlds/{world}/lore/{entry}` (Task 011): a reference page, not the entry editor with its
 * buttons taken away. Its type, its name, its own lead, its picture's public square and its article in a reading
 * column - rendered by the same read-only renderer the workspace uses, so no markup is ever parsed from text, and with
 * its workspace links already removed by the API. Nothing else of the entry exists here: no fields, aliases, tags,
 * relationships, Canon status or history.
 *
 * The world and the entry are read together; either missing - private, trashed, or never there - is the one page that
 * says nothing about which. The owner, signed in, gets a quiet "Edit in workspace".
 */
export default function PublicLorePage() {
  const { slug = '', loreSlug = '' } = useParams<{ slug: string; loreSlug: string }>()
  const key = `${slug}/${loreSlug}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getPublicUniverse(slug, controller.signal),
      getPublicLore(slug, loreSlug, controller.signal),
    ])
      .then(([world, entry]) => setState({ key, kind: 'ready', world, entry }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, kind: (error as { status?: number }).status === 404 ? 'missing' : 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [slug, loreSlug, key, attempt])

  const current = state?.key === key ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title="This page is not available." testId="lore-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pread" role="status" aria-label="Opening this entry">
        <div className="pread__skeleton" />
      </div>
    )
  }

  return <Entry world={current.world} entry={current.entry} />
}

function Entry({ world, entry }: { world: PublicUniverse; entry: PublicLoreDetail }) {
  useDocumentTitle(entry.name, world.name)
  const owner = useWorkspaceLink(world.slug, { lore: entry.slug })

  return (
    <article className="pread plore" data-testid="public-lore">
      <nav className="pcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link
              className="pcrumbs__back"
              to={worldPath(world.slug)}
              data-testid="public-lore-world"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              <bdi>{world.name}</bdi>
            </Link>
          </li>
          <li aria-current="page">Lore</li>
        </ol>
      </nav>

      <header className="pread__head">
        <p className="pread__eyebrow" data-testid="public-lore-type">
          <bdi>{entry.typeName}</bdi>
        </p>
        <h1 className="pread__title" dir="auto">
          <bdi>{entry.name}</bdi>
        </h1>
        {entry.summary ? (
          <p className="pread__lede" dir="auto" data-testid="public-lore-summary">
            {entry.summary}
          </p>
        ) : null}
        {owner?.entityId ? (
          <Link
            className="pread__edit"
            to={`/app/universes/${owner.universeId}/lore/${owner.entityId}`}
            data-testid="edit-in-workspace"
          >
            Edit in workspace
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </Link>
        ) : null}
      </header>

      <div className="plore__body" data-picture={entry.thumbnailUrl ? 'true' : 'false'}>
        {entry.thumbnailUrl ? (
          <figure className="plore__figure">
            <img
              src={entry.thumbnailUrl}
              alt={entry.name}
              width={320}
              height={320}
              decoding="async"
            />
          </figure>
        ) : null}
        <div className="plore__article" data-testid="public-lore-article">
          {entry.article ? <LoreArticle content={entry.article} /> : null}
        </div>
      </div>

      <footer className="pread__foot">
        <Link className="plink" to={worldPath(world.slug)}>
          More from <bdi>{world.name}</bdi>
        </Link>
      </footer>
    </article>
  )
}
