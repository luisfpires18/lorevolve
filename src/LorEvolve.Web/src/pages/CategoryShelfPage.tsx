import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus } from 'lucide-react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { CinemaSagas } from '../components/CinemaSagas'
import { ComicCollections } from '../components/ComicCollections'
import { CoverDrawer } from '../components/CoverDrawer'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ShelfCard, shelfStep, type ShelfFrame } from '../components/ShelfCard'
import { pictureUrl, projectCoverStore } from '../covers/api'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listAllProjects, reorderProjects } from '../projects/api'
import { formatLabel, kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import { type ProjectDetail, type ProjectKindValue } from '../projects/types'
import { useUniverseAccess } from '../universes/access'
import { sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; projects: ProjectDetail[] } | { kind: 'failed' }

/**
 * A second view a shelf can switch to: Sagas and Phases on Cinema (#289), Story Arcs and Events on Comic (#296).
 */
const VIEWS = {
  sagas: {
    words: 'sagas',
    second: 'sagasView',
    testId: 'cinema',
    secondTestId: 'cinema-view-sagas',
    Body: CinemaSagas,
  },
  arcs: {
    words: 'comics',
    second: 'collectionsView',
    testId: 'comic',
    secondTestId: 'comic-view-collections',
    Body: ComicCollections,
  },
} as const

/**
 * One Creation category's projects, each drawn as the thing it will be (owner, 2026-11-17): Gaming on a handheld,
 * Cinema on a strip of film, Comic as an issue. The pages differ only in their kinds, their object and their empty
 * words; the ⋯ menu with Add picture and Move up / Move down, and the optimistic move a refusal puts back, are one.
 *
 * The server orders one kind at a time (`PUT /api/universes/{id}/projects/order`), handing that kind's places out
 * again. So on a shelf of two kinds (Cinema: Film and Series) a card moves past the next card of its own kind and the
 * other kind keeps its places: a film never trades places with a series.
 */
export default function CategoryShelfPage({
  section,
  kinds,
  frame,
  empty,
  view,
}: {
  section: Section
  /** The kinds on this shelf, a stable array; the first is the New project default. */
  kinds: readonly ProjectKindValue[]
  frame: ShelfFrame
  empty: 'projects.list.emptyGame' | 'projects.list.emptyCinema' | 'projects.list.emptyComic'
  view?: keyof typeof VIEWS
}) {
  useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const heading = sectionLabel(section)
  useDocumentTitle(heading)
  const [params] = useSearchParams()
  const views = view ? VIEWS[view] : null
  const showView = view !== undefined && params.get('view') === view
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const [covering, setCovering] = useState<ProjectDetail | null>(null)
  const isMoving = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    listAllProjects({ universeId: universe.id }, controller.signal)
      .then((projects) =>
        setState({
          kind: 'ready',
          projects: projects.filter((project) => kinds.includes(project.kind)),
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [universe.id, kinds])

  /** The card of the same kind next to this one, the way it would move, or -1 at the end of its kind. */
  function neighbour(list: ProjectDetail[], from: number, by: -1 | 1) {
    for (let at = from + by; at >= 0 && at < list.length; at += by) {
      if (list[at].kind === list[from].kind) return at
    }
    return -1
  }

  /** Moves one project past its neighbour of the same kind, on screen first; a refusal puts it back. */
  async function move(project: ProjectDetail, by: -1 | 1) {
    if (state.kind !== 'ready' || isMoving.current) return
    const before = state.projects
    const from = before.findIndex((candidate) => candidate.id === project.id)
    const to = from < 0 ? -1 : neighbour(before, from, by)
    if (to < 0) return

    const after = [...before]
    after[from] = before[to]
    after[to] = before[from]
    const ofKind = after.filter((candidate) => candidate.kind === project.kind)
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', projects: after })
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-project-id="${project.id}"] [data-testid="shelf-actions"]`,
        )
        ?.focus(),
    )
    try {
      const saved = await reorderProjects(
        universe.id,
        project.kind,
        ofKind.map((candidate) => candidate.id),
      )
      setState({
        kind: 'ready',
        projects: saved.filter((candidate) => kinds.includes(candidate.kind)),
      })
      setAnnouncement(
        t('projects.shelf.moved', {
          name: project.name,
          n: ofKind.findIndex((candidate) => candidate.id === project.id) + 1,
          total: ofKind.length,
        }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', projects: before })
      setMoveError(error instanceof ApiError ? error.message : t('projects.shelf.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  const newProject = (
    <Link
      className="button"
      to={`/app/projects/new?universeId=${universe.id}&kind=${kinds[0]}`}
      data-testid="projects-page-new"
    >
      <ActionIcon icon={Plus} />
      {t('projects.nav.new')}
    </Link>
  )

  return (
    <article className="stories" data-testid="projects-page">
      <PageHeader
        title={heading}
        lede={t('projects.list.lede')}
        actions={access.editContent ? newProject : null}
      />

      {views ? (
        <nav
          className="views"
          aria-label={t(`projects.${views.words}.viewsLabel`)}
          data-testid={`${views.testId}-views`}
        >
          <Link
            className="views__link"
            to="?"
            aria-current={showView ? undefined : 'page'}
            data-testid={`${views.testId}-view-projects`}
          >
            {t(`projects.${views.words}.projectsView`)}
          </Link>
          <Link
            className="views__link"
            to={`?view=${view}`}
            aria-current={showView ? 'page' : undefined}
            data-testid={views.secondTestId}
          >
            {t(`projects.${views.words}.${views.second}` as 'projects.sagas.sagasView')}
          </Link>
        </nav>
      ) : null}

      {views && showView ? <views.Body universeId={universe.id} /> : null}

      {!showView && state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('projects.list.loading')}
        </p>
      ) : null}

      {!showView && state.kind === 'failed' ? (
        <EmptyState title={t('projects.list.failed')} testId="projects-failed" />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="shelf-announcement">
        {announcement}
      </p>
      {moveError ? (
        <p className="form__message" role="alert" data-testid="shelf-move-error">
          {moveError}
        </p>
      ) : null}

      {!showView && state.kind === 'ready' && state.projects.length > 0 ? (
        <ul
          className={frame === 'console' || frame === 'film' ? 'shelf shelf--wide' : 'shelf'}
          data-testid="projects-list"
        >
          {state.projects.map((project, index) => (
            <ShelfCard
              key={project.id}
              frame={frame}
              href={projectRowPath(project)}
              title={project.name}
              description={project.summary}
              step={shelfStep(project.lifecycle)}
              statusLabel={lifecycleLabel(project.lifecycle)}
              meta={
                // A shelf of two kinds names each card's kind: a film and a series may share a name.
                [
                  kinds.length > 1 ? kindLabel(project.kind) : null,
                  project.format ? formatLabel(project.format) : project.subtype,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              cover={
                project.cover
                  ? pictureUrl(projectCoverStore(project.id, project.kind), project.cover, 'card')
                  : null
              }
              openTestId={`projects-row-${project.id}`}
              onAddPicture={access.editContent ? () => setCovering(project) : undefined}
              attrs={{
                'data-testid': 'projects-item',
                'data-project-id': project.id,
                'data-kind': String(project.kind),
              }}
              menu={
                access.editContent ? (
                  <ActionMenu
                    label={t('projects.common.more', { name: project.name })}
                    triggerTestId="shelf-actions"
                  >
                    <button
                      className="actionmenu__item"
                      type="button"
                      onClick={() => setCovering(project)}
                      data-testid="shelf-cover"
                    >
                      <ActionIcon icon={ImageIcon} />
                      {t(
                        project.cover
                          ? 'projects.common.changePicture'
                          : 'projects.common.addPicture',
                      )}
                    </button>
                    {neighbour(state.projects, index, -1) >= 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(project, -1)}
                        data-testid="shelf-move-up"
                      >
                        <ActionIcon icon={ArrowUp} />
                        {t('projects.common.moveUp')}
                      </button>
                    ) : null}
                    {neighbour(state.projects, index, 1) >= 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(project, 1)}
                        data-testid="shelf-move-down"
                      >
                        <ActionIcon icon={ArrowDown} />
                        {t('projects.common.moveDown')}
                      </button>
                    ) : null}
                  </ActionMenu>
                ) : null
              }
            />
          ))}
        </ul>
      ) : null}

      {!showView && state.kind === 'ready' && state.projects.length === 0 ? (
        <EmptyState
          title={t(empty)}
          hint={t('projects.list.emptyCategoryHint')}
          action={access.editContent ? newProject : undefined}
          testId="projects-empty"
        />
      ) : null}

      {covering ? (
        <CoverDrawer
          universeId={universe.id}
          name={covering.name}
          cover={covering.cover ?? null}
          store={projectCoverStore(covering.id, covering.kind)}
          onChanged={(cover) => {
            setCovering({ ...covering, cover })
            setState((current) =>
              current.kind === 'ready'
                ? {
                    kind: 'ready',
                    projects: current.projects.map((one) =>
                      one.id === covering.id ? { ...one, cover } : one,
                    ),
                  }
                : current,
            )
          }}
          onClose={() => setCovering(null)}
        />
      ) : null}
    </article>
  )
}
