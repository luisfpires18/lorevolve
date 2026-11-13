import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowUpRight, Feather, Globe, Library, Lock } from 'lucide-react'
import { ActionIcon } from '../components/ActionIcon'
import { PageHeader } from '../components/PageHeader'
import { PublicDetailsForm } from '../components/PublicDetailsForm'
import { UniverseArtworkField } from '../components/UniverseArtworkField'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { listPublicLore, listPublicStories, worldPath } from '../portal/api'
import {
  getPublication,
  getPublishEverything,
  getSelectedLore,
  publishEverything,
  publishUniverse,
  unpublishUniverse,
} from '../publishing/api'
import {
  REQUIREMENTS,
  Visibility,
  categoryLabel,
  genreLabel,
  requirementLabel,
  type PublicationState,
  type PublishEverythingPreview,
  type PublishEverythingResult,
  type SelectedLore,
} from '../publishing/types'
import type { WorkspaceContext } from './UniverseWorkspace'

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
  const { t, tx } = useI18n()
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
  // Bumped after Publish everything, so the counts below are read again.
  const [countRound, setCountRound] = useState(0)
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
          setLoadError(error instanceof Error ? error.message : t('universe.publish.loadFailed'))
        }),
    [universeId, t],
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
  }, [isPublic, slug, countRound])

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
      title={t('universe.publish.title')}
      lede={<p>{t('universe.publish.lede')}</p>}
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
            {t('universe.publish.retry')}
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
          {t('universe.publish.loading')}
        </p>
      </article>
    )
  }

  const missing = REQUIREMENTS.filter((requirement) => requirement.key in state.missing)

  async function askToPublish() {
    setProblem(null)
    setAnnouncement(null)

    if (detailsDirty) {
      setProblem([t('universe.publish.saveFirst')])
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
      setProblem([error instanceof Error ? error.message : t('universe.publish.checkFailed')])
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
      setAnnouncement(t('universe.publish.published'))
    } catch (error: unknown) {
      setConfirming(null)
      setProblem(
        error instanceof ApiError && Object.keys(error.fieldErrors).length > 0
          ? Object.values(error.fieldErrors)
          : [error instanceof Error ? error.message : t('universe.publish.publishFailed')],
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
      setAnnouncement(t('universe.publish.madePrivate'))
    } catch (error: unknown) {
      setProblem([error instanceof Error ? error.message : t('universe.publish.privateFailed')])
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
                {t('universe.publish.viewPublic')}
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
              {t('universe.publish.makePrivate')}
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
            {t('universe.publish.publishWorld')}
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
            {t('universe.publish.status')}
          </h2>
          <p className="publication__state" data-testid="publication-status">
            <span className="publication__badge" data-state={isPublic ? 'public' : 'private'}>
              {isPublic ? t('universe.publish.badgePublic') : t('universe.publish.badgePrivate')}
            </span>{' '}
            {isPublic ? t('universe.publish.visiblePublic') : t('universe.publish.visiblePrivate')}
          </p>

          {isPublic && slug ? (
            <p className="publication__address" data-testid="publication-address">
              <span className="publication__label">{t('universe.publish.address')}</span>{' '}
              <span className="publication__path">{worldPath(slug)}</span>
            </p>
          ) : null}

          {!isPublic ? (
            <ul
              className="publication__checklist"
              aria-label={t('universe.publish.checklist')}
              data-testid="publication-checklist"
            >
              {REQUIREMENTS.map((requirement) => {
                const needed = requirement.key in state.missing
                return (
                  <li key={requirement.key} data-state={needed ? 'needed' : 'done'}>
                    <span className="publication__mark" aria-hidden="true">
                      {needed ? '○' : '✓'}
                    </span>
                    {requirementLabel(requirement.key)}
                    <span className="publication__word">
                      {needed ? t('universe.publish.needed') : t('universe.publish.done')}
                    </span>
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
              <p className="callout__title">{t('universe.publish.notYet')}</p>
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
                {tx('universe.publish.confirm.title', { name: <bdi>{confirming.state.name}</bdi> })}
              </h3>
              <p className="settings__note">{t('universe.publish.confirm.anyone')}</p>
              <dl className="publication__facts">
                <div>
                  <dt>{t('universe.publish.confirm.titleLabel')}</dt>
                  <dd>
                    <bdi>{confirming.state.name}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t('universe.publish.confirm.summary')}</dt>
                  <dd className="prose">{confirming.state.publicSummary}</dd>
                </div>
                <div>
                  <dt>{t('universe.publish.confirm.artwork')}</dt>
                  <dd>{t('universe.publish.confirm.artworkValue')}</dd>
                </div>
                <div>
                  <dt>{t('universe.publish.confirm.category')}</dt>
                  <dd>
                    {confirming.state.category ? categoryLabel(confirming.state.category) : ''}
                  </dd>
                </div>
                <div>
                  <dt>{t('universe.publish.confirm.genres')}</dt>
                  <dd>{confirming.state.genres.map(genreLabel).join(', ')}</dd>
                </div>
                {confirming.state.originalCreator ? (
                  <>
                    <div>
                      <dt>{t('universe.publish.confirm.basedOn')}</dt>
                      <dd>
                        {confirming.state.originalWork ? (
                          tx('universe.publish.confirm.basedOnValue', {
                            creator: <bdi>{confirming.state.originalCreator}</bdi>,
                            work: <bdi>{confirming.state.originalWork}</bdi>,
                          })
                        ) : (
                          <bdi>{confirming.state.originalCreator}</bdi>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('universe.publish.confirm.curator')}</dt>
                      <dd>
                        <bdi>{confirming.state.authorDisplayName}</bdi>
                      </dd>
                    </div>
                  </>
                ) : (
                  <div>
                    <dt>{t('universe.publish.confirm.author')}</dt>
                    <dd>
                      <bdi>{confirming.state.authorDisplayName}</bdi>
                    </dd>
                  </div>
                )}
              </dl>
              <SelectedLoreReview selected={confirming.selected} />
              <p className="settings__note">
                <strong>{t('universe.publish.confirm.notPublished')}</strong>{' '}
                {t('universe.publish.confirm.staysPrivate')}
              </p>
              <div className="form__actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void publish()}
                  data-testid="confirm-publish"
                >
                  {busy
                    ? t('universe.publish.confirm.publishing')
                    : t('universe.publish.confirm.publish')}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  {t('universe.publish.confirm.keepPrivate')}
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
                {tx('universe.publish.unpublish.title', { name: <bdi>{state.name}</bdi> })}
              </h3>
              <p className="settings__note">{t('universe.publish.unpublish.note')}</p>
              <div className="form__actions">
                <button
                  className="button"
                  type="button"
                  disabled={busy}
                  onClick={() => void unpublish()}
                  data-testid="confirm-unpublish"
                >
                  {busy
                    ? t('universe.publish.unpublish.working')
                    : t('universe.publish.unpublish.confirm')}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming(null)}
                >
                  {t('universe.publish.unpublish.keep')}
                </button>
              </div>
            </div>
          ) : null}

          {!isPublic && missing.length === 0 && !detailsDirty && !confirming ? (
            <p className="field__hint" data-testid="publication-ready">
              {t('universe.publish.ready')}
            </p>
          ) : null}
        </section>

        <Section id="publish-details" title={t('universe.publish.detailsSection')}>
          <PublicDetailsForm
            universeId={universeId}
            state={state}
            onSaved={setState}
            onDirtyChange={setDetailsDirty}
          />
        </Section>

        <Section id="publish-artwork" title={t('universe.publish.artworkSection')}>
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

        <Section id="publish-author" title={t('universe.publish.authorSection')}>
          {state.authorDisplayName ? (
            <p className="settings__note" data-testid="publication-author">
              {state.originalCreator ? (
                <>
                  {tx('universe.publish.author.curated', {
                    name: <bdi>{state.authorDisplayName}</bdi>,
                    creator: <bdi>{state.originalCreator}</bdi>,
                  })}{' '}
                </>
              ) : (
                <>
                  {tx('universe.publish.author.publishedAs', {
                    name: <bdi>{state.authorDisplayName}</bdi>,
                  })}{' '}
                </>
              )}
              <Link to="/app/profile">{t('universe.publish.author.change')}</Link>
            </p>
          ) : (
            <p className="settings__note" data-testid="publication-author">
              {tx('universe.publish.author.none', {
                link: <Link to="/app/profile">{t('universe.publish.author.noneLink')}</Link>,
              })}
            </p>
          )}
        </Section>

        <Section id="publish-content" title={t('universe.publish.contentSection')}>
          <p className="settings__note">{t('universe.publish.contentNote')}</p>
          <ul className="publish__content" data-testid="published-content">
            <li>
              <ActionIcon icon={Library} />
              <span className="publish__contentname">{t('universe.publish.lore')}</span>
              <span className="publish__contentcount" data-testid="published-lore">
                {published ? t('universe.publish.loreCount', { n: published.lore }) : null}
              </span>
              <Link className="button button--secondary button--sm" to={`${base}/lore`}>
                {t('universe.publish.viewLore')}
              </Link>
            </li>
            <li>
              <ActionIcon icon={Feather} />
              <span className="publish__contentname">{t('universe.publish.stories')}</span>
              <span className="publish__contentcount" data-testid="published-stories">
                {published ? t('universe.publish.storiesCount', { n: published.stories }) : null}
              </span>
              <Link className="button button--secondary button--sm" to={`${base}/stories`}>
                {t('universe.publish.viewStories')}
              </Link>
            </li>
          </ul>
          {isPublic ? (
            <PublishEverything
              universeId={universeId}
              onPublished={() => setCountRound((round) => round + 1)}
            />
          ) : null}
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
  const { t, tn } = useI18n()
  const { totalCount, items } = selected
  if (totalCount === 0) {
    return (
      <p className="settings__note" data-testid="publish-confirm-no-selected-lore">
        <strong>{t('universe.publish.selected.loreLabel')}</strong>{' '}
        {t('universe.publish.selected.none')}
      </p>
    )
  }

  return (
    <div className="publication__selected" data-testid="publish-confirm-selected-lore">
      <p className="settings__note" id="publish-confirm-lore">
        <strong>{t('universe.publish.selected.alsoPublic')}</strong>{' '}
        {tn('universe.publish.selected.some', totalCount, { n: totalCount })}
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
          {t('universe.publish.selected.more', { n: totalCount - items.length })}
        </p>
      ) : null}
      <p className="settings__note">{t('universe.publish.selected.again')}</p>
    </div>
  )
}

/**
 * Publish everything: every Canon lore entry and every Complete story, with its scenes and their text, in one action. The
 * confirmation names each of them, read fresh from the server, and the stories skipped for want of a public summary. It
 * only adds: Idea and Draft lore, unfinished stories, plot arcs and anything already public are left as they are.
 */
function PublishEverything({
  universeId,
  onPublished,
}: {
  universeId: string
  onPublished: () => void
}) {
  const { t, tn } = useI18n()

  function publishedSentence({ lore, stories, scenes }: PublishEverythingResult) {
    if (lore + stories + scenes === 0) return t('universe.publish.everything.nothingPublished')
    return t('universe.publish.everything.publishedSentence', {
      lore: tn('universe.publish.everything.publishedLore', lore, { n: lore }),
      stories: tn('universe.publish.everything.publishedStories', stories, { n: stories }),
      scenes: tn('universe.publish.everything.publishedScenes', scenes, { n: scenes }),
    })
  }

  const [preview, setPreview] = useState<PublishEverythingPreview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (preview) panel.current?.focus()
  }, [preview])

  async function ask() {
    setError(null)
    setDone(null)
    setBusy(true)
    try {
      setPreview(await getPublishEverything(universeId))
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : t('universe.publish.everything.checkFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const result = await publishEverything(universeId)
      setPreview(null)
      setDone(publishedSentence(result))
      onPublished()
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : t('universe.publish.everything.publishFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  const nothing = preview !== null && preview.lore.length === 0 && preview.stories.length === 0

  return (
    <div className="publish__everything" data-testid="publish-everything">
      <p className="settings__note">{t('universe.publish.everything.note')}</p>
      {!preview ? (
        <button
          className="button button--secondary"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void ask()}
          data-testid="publish-everything-open"
        >
          <ActionIcon icon={Globe} />
          {t('universe.publish.everything.open')}
        </button>
      ) : null}

      {error ? (
        <p className="form__message" role="alert" data-testid="publish-everything-error">
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="settings__saved" role="status" data-testid="publish-everything-done">
          {done}
        </p>
      ) : null}

      {preview ? (
        <div
          className="publication__confirm"
          role="group"
          aria-labelledby="publish-everything-title"
          tabIndex={-1}
          ref={panel}
          data-testid="publish-everything-confirm"
        >
          <h3 className="publication__confirmtitle" id="publish-everything-title">
            {nothing
              ? t('universe.publish.everything.nothingTitle')
              : t('universe.publish.everything.title')}
          </h3>
          {nothing ? (
            <p className="settings__note">{t('universe.publish.everything.allPublic')}</p>
          ) : (
            <>
              <p className="settings__note">{t('universe.publish.everything.anyone')}</p>
              {preview.lore.length > 0 ? (
                <div className="publication__selected">
                  <p className="settings__note" id="publish-everything-lore">
                    <strong>
                      {tn('universe.publish.everything.loreHeading', preview.lore.length, {
                        n: preview.lore.length,
                      })}
                    </strong>
                  </p>
                  <ul
                    className="publication__selectedlist"
                    aria-labelledby="publish-everything-lore"
                    tabIndex={0}
                  >
                    {preview.lore.map((entry) => (
                      <li key={entry.id} data-testid="publish-everything-entry">
                        <bdi>{entry.name}</bdi>{' '}
                        <span className="publication__selectedtype">
                          · <bdi>{entry.typeName}</bdi>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preview.stories.length > 0 ? (
                <div className="publication__selected">
                  <p className="settings__note" id="publish-everything-stories">
                    <strong>
                      {tn('universe.publish.everything.storiesHeading', preview.stories.length, {
                        n: preview.stories.length,
                      })}
                    </strong>
                  </p>
                  <ul
                    className="publication__selectedlist"
                    aria-labelledby="publish-everything-stories"
                    tabIndex={0}
                  >
                    {preview.stories.map((story) => (
                      <li key={story.id} data-testid="publish-everything-story">
                        <bdi>{story.title}</bdi>{' '}
                        <span className="publication__selectedtype">
                          ·{' '}
                          {tn('universe.publish.everything.storyScenes', story.scenes, {
                            n: story.scenes,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
          {preview.skippedStories.length > 0 ? (
            <div className="publication__selected" data-testid="publish-everything-skipped">
              <p className="settings__note" id="publish-everything-skipped">
                <strong>{t('universe.publish.everything.skipped')}</strong>{' '}
                {t('universe.publish.everything.skippedNote')}
              </p>
              <ul
                className="publication__selectedlist"
                aria-labelledby="publish-everything-skipped"
                tabIndex={0}
              >
                {preview.skippedStories.map((story) => (
                  <li key={story.id}>
                    <bdi>{story.title}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="form__actions">
            {nothing ? null : (
              <button
                className="button"
                type="button"
                disabled={busy}
                aria-busy={busy}
                onClick={() => void confirm()}
                data-testid="publish-everything-confirm-button"
              >
                {busy
                  ? t('universe.publish.everything.publishing')
                  : t('universe.publish.everything.confirm')}
              </button>
            )}
            <button
              className="button button--secondary"
              type="button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {nothing
                ? t('universe.publish.everything.close')
                : t('universe.publish.everything.keepPrivate')}
            </button>
          </div>
          {nothing ? null : (
            <p className="settings__note">{t('universe.publish.everything.again')}</p>
          )}
        </div>
      ) : null}
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
