import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowUpRight, Feather, Globe, Library, Lock } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { PageHeader } from '../components/PageHeader'
import { PublicDetailsForm } from '../components/PublicDetailsForm'
import { UniverseArtworkField } from '../components/UniverseArtworkField'
import { ApiError } from '../lib/api'
import { listPublicLore, listPublicStories, worldPath } from '../portal/api'
import {
  getPublication,
  getSelectedLore,
  publishUniverse,
  unpublishUniverse,
} from '../publishing/api'
import {
  REQUIREMENTS,
  Visibility,
  categoryLabel,
  genreLabel,
  type PublicationState,
  type SelectedLore,
} from '../publishing/types'
import type { WorkspaceContext } from './UniverseWorkspace'

/** What the everything-else list names, so an author knows exactly what publishing leaves private. */
const STAYS_PRIVATE =
  'Any lore entry, story, scene, scene prose or plot arc you have not published where it is written, notes, ideas, the timeline, world rules, relationships, Canon, the Trash, and everything else you edit in the workspace.'

type Confirming =
  { kind: 'publish'; state: PublicationState; selected: SelectedLore } | { kind: 'unpublish' }

/** How many entries and stories readers can see now - read from the public API itself, so it cannot disagree with it. */
type Published = { slug: string; lore: number; stories: number } | null

/**
 * Publish (UI refinement 014): a universe's public presentation, in the workspace, on a page of its own rather than a
 * section of Settings. It answers, top to bottom: is this universe public, what stands between it and publishing, what
 * readers see - its public summary, category, genres, artwork and author - and what of its lore and stories is out.
 *
 * The rules are the publication foundation's, unchanged (ADR 0036): visibility in words, never only a colour; publishing
 * refused - with the missing things listed - until everything is there, never over unsaved public details, and only
 * through a confirmation that lists exactly what becomes public, read fresh from the server; making it private
 * deliberate and confirmed too. The author's public name and photo stay the account's, on the Profile; this page shows
 * them and links there.
 */
export default function UniversePublish() {
  const { universe, setArtwork } = useOutletContext<WorkspaceContext>()
  const universeId = universe.id
  const base = `/app/universes/${universeId}`

  const [state, setState] = useState<PublicationState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string[] | null>(null)
  const [announcement, setAnnouncement] = useState<string | null>(null)
  const [counted, setCounted] = useState<Published>(null)
  const panel = useRef<HTMLDivElement>(null)
  const problemRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    (signal?: AbortSignal) =>
      getPublication(universeId, signal)
        .then((next) => {
          setState(next)
          setLoadError(null)
        })
        .catch((error: unknown) => {
          if (signal?.aborted) return
          setLoadError(
            error instanceof Error ? error.message : 'The public details could not be loaded.',
          )
        }),
    [universeId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  const isPublic = state?.visibility === Visibility.Public
  const slug = state?.publicSlug ?? null

  // What readers can see inside it: the public listings' own totals, asked only while the universe is public.
  useEffect(() => {
    if (!isPublic || !slug) return
    const controller = new AbortController()
    Promise.all([
      listPublicLore(slug, 1, controller.signal),
      listPublicStories(slug, 1, controller.signal),
    ])
      .then(([lore, stories]) =>
        setCounted({ slug, lore: lore.totalCount, stories: stories.totalCount }),
      )
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [isPublic, slug])

  // Counts belong to the address they were read for, and only while the universe is public.
  const published = isPublic && counted?.slug === slug ? counted : null

  // The confirmation takes the focus when it opens, and a refusal does when it appears.
  useEffect(() => {
    if (confirming) panel.current?.focus()
  }, [confirming])

  useEffect(() => {
    if (problem) problemRef.current?.focus()
  }, [problem])

  // The one control that changes who can see this universe lives at the head of the page (Product refinement 015):
  // Publish world, the page's primary action, while it is private; Make private, visible but in danger ink, while it is
  // public. Both open the confirmation in Status below rather than acting at once.
  const pageHeader = (actions: ReactNode) => (
    <PageHeader
      title="Publish"
      lede={<p>Control how this universe appears on the public LorEvolve portal.</p>}
      actions={actions}
    />
  )
  const header = pageHeader(null)

  if (loadError) {
    return (
      <article className="publish" data-testid="public-portal">
        {header}
        <div className="notice notice--error" role="alert">
          <p>{loadError}</p>
          <button className="button button--secondary" type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </article>
    )
  }

  if (!state) {
    return (
      <article className="publish" data-testid="public-portal">
        {header}
        <p className="notice" role="status">
          Loading the public details…
        </p>
      </article>
    )
  }

  const missing = REQUIREMENTS.filter((requirement) => requirement.key in state.missing)

  async function askToPublish() {
    setProblem(null)
    setAnnouncement(null)

    if (detailsDirty) {
      setProblem(['Save the public details first: a universe is published with what is saved.'])
      return
    }

    setBusy(true)
    try {
      // Fresh, so the confirmation names exactly what is saved - including a name changed elsewhere - and exactly the
      // entries that would become public with it (Issue #47).
      const [fresh, selected] = await Promise.all([
        getPublication(universeId),
        getSelectedLore(universeId),
      ])
      setState(fresh)

      const stillMissing = REQUIREMENTS.filter((requirement) => requirement.key in fresh.missing)
      if (stillMissing.length > 0) {
        setProblem(stillMissing.map((requirement) => fresh.missing[requirement.key][0]))
        return
      }

      setConfirming({ kind: 'publish', state: fresh, selected })
    } catch (error: unknown) {
      setProblem([error instanceof Error ? error.message : 'That could not be checked. Try again.'])
    } finally {
      setBusy(false)
    }
  }

  async function publish() {
    setBusy(true)
    setProblem(null)
    try {
      const next = await publishUniverse(universeId)
      setState(next)
      setConfirming(null)
      setAnnouncement('Published. This universe can now appear in the public portal.')
    } catch (error: unknown) {
      setConfirming(null)
      setProblem(
        error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
          ? Object.values(error.fieldErrors)
          : [error instanceof Error ? error.message : 'It could not be published. Try again.'],
      )
      void load()
    } finally {
      setBusy(false)
    }
  }

  async function unpublish() {
    setBusy(true)
    setProblem(null)
    try {
      setState(await unpublishUniverse(universeId))
      setConfirming(null)
      setAnnouncement('Made private. Its public page is no longer available.')
    } catch (error: unknown) {
      setProblem([
        error instanceof Error ? error.message : 'It could not be made private. Try again.',
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="publish" data-testid="public-portal">
      {pageHeader(
        isPublic ? (
          <>
            {slug ? (
              <Link
                className="button button--secondary"
                to={worldPath(slug)}
                data-testid="view-public-page"
              >
                View public world
                <ActionIcon icon={ArrowUpRight} />
              </Link>
            ) : null}
            <button
              className="button button--secondary button--danger-quiet"
              type="button"
              disabled={busy}
              onClick={() => {
                setProblem(null)
                setAnnouncement(null)
                setConfirming({ kind: 'unpublish' })
              }}
              data-testid="unpublish"
            >
              <ActionIcon icon={Lock} />
              Make private
            </button>
          </>
        ) : (
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void askToPublish()}
            data-testid="publish"
          >
            <ActionIcon icon={Globe} />
            Publish world
          </button>
        ),
      )}

      {/* One outer shell for every workspace page; only the form keeps a readable column. */}
      <div className="publish__body">
        <section
          className="publish__section publish__status"
          aria-labelledby="publish-status-heading"
        >
          <h2 className="publish__heading" id="publish-status-heading">
            Status
          </h2>
          <p className="publication__state" data-testid="publication-status">
            <span className="publication__badge" data-state={isPublic ? 'public' : 'private'}>
              {isPublic ? 'Public' : 'Private'}
            </span>{' '}
            {isPublic
              ? 'This universe is visible on the LorEvolve portal.'
              : 'This universe is visible only in your workspace.'}
          </p>

          {isPublic && slug ? (
            <p className="publication__address" data-testid="publication-address">
              <span className="publication__label">Public address</span>{' '}
              <span className="publication__path">{worldPath(slug)}</span>
            </p>
          ) : null}

          {!isPublic ? (
            <ul
              className="publication__checklist"
              aria-label="What publishing needs"
              data-testid="publication-checklist"
            >
              {REQUIREMENTS.map((requirement) => {
                const needed = requirement.key in state.missing
                return (
                  <li key={requirement.key} data-state={needed ? 'needed' : 'done'}>
                    <span className="publication__mark" aria-hidden="true">
                      {needed ? '○' : '✓'}
                    </span>
                    {requirement.label}
                    <span className="publication__word">{needed ? ' - needed' : ' - done'}</span>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {problem ? (
            <div
              className="callout callout--warning publication__problem"
              role="alert"
              tabIndex={-1}
              ref={problemRef}
              data-testid="publication-problem"
            >
              <p className="callout__title">Not published yet</p>
              <ul className="publication__missing">
                {problem.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {announcement ? (
            <p className="settings__saved" role="status" data-testid="publication-announcement">
              {announcement}
            </p>
          ) : null}

          {confirming?.kind === 'publish' ? (
            <div
              className="publication__confirm"
              role="group"
              aria-labelledby="publish-confirm-title"
              tabIndex={-1}
              ref={panel}
              data-testid="publish-confirm"
            >
              <h3 className="publication__confirmtitle" id="publish-confirm-title">
                Publish <bdi>{confirming.state.name}</bdi>?
              </h3>
              <p className="settings__note">Anyone will be able to see:</p>
              <dl className="publication__facts">
                <div>
                  <dt>Title</dt>
                  <dd>
                    <bdi>{confirming.state.name}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>Public summary</dt>
                  <dd className="prose">{confirming.state.publicSummary}</dd>
                </div>
                <div>
                  <dt>Artwork</dt>
                  <dd>Its card, as shown below</dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>
                    {confirming.state.category ? categoryLabel(confirming.state.category) : ''}
                  </dd>
                </div>
                <div>
                  <dt>Genres</dt>
                  <dd>{confirming.state.genres.map(genreLabel).join(', ')}</dd>
                </div>
                {confirming.state.originalCreator ? (
                  <>
                    <div>
                      <dt>Based on works by</dt>
                      <dd>
                        <bdi>{confirming.state.originalCreator}</bdi>
                        {confirming.state.originalWork ? (
                          <>
                            {' '}
                            (<bdi>{confirming.state.originalWork}</bdi>)
                          </>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Curated on LorEvolve by</dt>
                      <dd>
                        <bdi>{confirming.state.authorDisplayName}</bdi>
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>Author</dt>
                    <dd>
                      <bdi>{confirming.state.authorDisplayName}</bdi>
                    </dd>
                  </div>
                )}
              </dl>
              <SelectedLoreReview selected={confirming.selected} />
              <p className="settings__note">
                <strong>Not published:</strong> {STAYS_PRIVATE}
              </p>
              <div className="form__actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void publish()}
                  data-testid="confirm-publish"
                >
                  {busy ? 'Publishing' : 'Publish world'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  Keep private
                </button>
              </div>
            </div>
          ) : null}

          {confirming?.kind === 'unpublish' ? (
            <div
              className="publication__confirm"
              role="group"
              aria-labelledby="unpublish-confirm-title"
              tabIndex={-1}
              ref={panel}
              data-testid="unpublish-confirm"
            >
              <h3 className="publication__confirmtitle" id="unpublish-confirm-title">
                Make <bdi>{state.name}</bdi> private?
              </h3>
              <p className="settings__note">
                Its public page and its place in Explore stop being available straight away. Its
                public details stay here, and its address is kept for when you publish it again.
              </p>
              <div className="form__actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void unpublish()}
                  data-testid="confirm-unpublish"
                >
                  {busy ? 'Making private' : 'Make private'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  Keep public
                </button>
              </div>
            </div>
          ) : null}

          {!isPublic && missing.length === 0 && !detailsDirty && !confirming ? (
            <p className="field__hint" data-testid="publication-ready">
              Everything a public card needs is here. Publish world, at the top of the page, makes
              it public.
            </p>
          ) : null}
        </section>

        <Section id="publish-details" title="Public details">
          <PublicDetailsForm
            universeId={universeId}
            state={state}
            onSaved={setState}
            onDirtyChange={setDetailsDirty}
          />
        </Section>

        <Section id="publish-artwork" title="Artwork">
          <UniverseArtworkField
            universeId={universeId}
            artwork={state.artwork}
            isPublic={isPublic}
            onChanged={(next) => {
              setArtwork(next)
              void load()
            }}
          />
        </Section>

        <Section id="publish-author" title="Author">
          {state.authorDisplayName ? (
            <p className="settings__note" data-testid="publication-author">
              {state.originalCreator ? (
                <>
                  Curated on LorEvolve by <bdi>{state.authorDisplayName}</bdi>, based on works by{' '}
                  <bdi>{state.originalCreator}</bdi>.{' '}
                </>
              ) : (
                <>
                  Published as <bdi>{state.authorDisplayName}</bdi>.{' '}
                </>
              )}
              <Link to="/app/profile">Change your public name</Link>
            </p>
          ) : (
            <p className="settings__note" data-testid="publication-author">
              You have no public name yet. <Link to="/app/profile">Choose one on your profile</Link>{' '}
              - it is shown as the author of what you publish; your username and email never are.
            </p>
          )}
        </Section>

        <Section id="publish-content" title="Published content">
          <p className="settings__note">
            Publishing this universe does not publish its lore entries or stories: each is published
            from its own page, and is seen only while this universe is public.
          </p>
          <ul className="publish__content" data-testid="published-content">
            <li>
              <ActionIcon icon={Library} />
              <span className="publish__contentname">Lore</span>
              <span className="publish__contentcount" data-testid="published-lore">
                {published ? `${published.lore} public` : null}
              </span>
              <Link className="button button--secondary button--sm" to={`${base}/lore`}>
                View lore
              </Link>
            </li>
            <li>
              <ActionIcon icon={Feather} />
              <span className="publish__contentname">Stories</span>
              <span className="publish__contentcount" data-testid="published-stories">
                {published ? `${published.stories} public` : null}
              </span>
              <Link className="button button--secondary button--sm" to={`${base}/stories`}>
                View stories
              </Link>
            </li>
          </ul>
        </Section>
      </div>
    </article>
  )
}

/**
 * The lore entries that become public with the world (Issue #47), by name and type: a private universe's entry pages do
 * not show which were selected, so the owner reviews them here before saying yes. Nothing here changes a selection.
 */
function SelectedLoreReview({ selected }: { selected: SelectedLore }) {
  const { totalCount, items } = selected
  if (totalCount === 0) {
    return (
      <p className="settings__note" data-testid="publish-confirm-no-selected-lore">
        <strong>Lore:</strong> no entry is selected for publication, so none becomes public with the
        world.
      </p>
    )
  }

  return (
    <div className="publication__selected" data-testid="publish-confirm-selected-lore">
      <p className="settings__note" id="publish-confirm-lore">
        <strong>Also public:</strong>{' '}
        {totalCount === 1
          ? 'the lore entry you selected for publication earlier.'
          : `the ${totalCount} lore entries you selected for publication earlier.`}
      </p>
      {/* Focusable so a long list scrolls from the keyboard as well. */}
      <ul className="publication__selectedlist" aria-labelledby="publish-confirm-lore" tabIndex={0}>
        {items.map((entry) => (
          <li key={entry.id} data-testid="publish-confirm-selected-entry">
            <bdi>{entry.name}</bdi>{' '}
            <span className="publication__selectedtype">
              · <bdi>{entry.typeName}</bdi>
            </span>
          </li>
        ))}
      </ul>
      {totalCount > items.length ? (
        <p className="settings__note" data-testid="publish-confirm-selected-more">
          And {totalCount - items.length} more.
        </p>
      ) : null}
      <p className="settings__note">
        Once the world is public, each entry's page lets you make it private again.
      </p>
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="publish__section" aria-labelledby={`${id}-heading`} id={id}>
      <h2 className="publish__heading" id={`${id}-heading`}>
        {title}
      </h2>
      {children}
    </section>
  )
}
