import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ApiError } from '../lib/api'
import { listAllProjects } from '../projects/api'
import { kindLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import type { ProjectDetail, ProjectKindValue } from '../projects/types'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { t, useI18n } from '../i18n'
import { listStories, reorderStories } from '../stories/api'
import { useUniverseAccess } from '../universes/access'
import { WRITING_PROJECTS, sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * What was read, and what it was read for. Keeping the request's own key beside the result is what lets the screen say
 * "loading" for a filter it has not read yet without setting state inside the effect: the answer is derived in render
 * from whether the key still matches.
 */
type LoadState =
  | { kind: 'ready'; for: string; projects: ProjectDetail[]; ordered: boolean }
  | { kind: 'failed'; for: string }

/**
 * Every project an author can reach, most recently updated first, each inside the universe it belongs to.
 *
 * `inUniverse` is the same screen inside one universe's workspace, narrowed to that universe's projects. Outside it the
 * list is every project of every universe the account can reach, which is all of them: a project belongs to exactly
 * one universe (#172), so there is no filter for projects without one and no way to make one here. New project is
 * offered inside a universe, where the universe it belongs to is already known.
 */
export default function ProjectsPage({
  inUniverse = false,
  kinds,
  section,
}: {
  inUniverse?: boolean
  /** Only these kinds: the sidebar's Writing, Gaming, Cinema, Comic and Game Entities open this list narrowed (#272). */
  kinds?: readonly ProjectKindValue[]
  /** The sidebar section this list is the page of, which names it. */
  section?: Section
}) {
  useI18n()
  const access = useUniverseAccess()
  const workspace = useOutletContext<WorkspaceContext | undefined>()
  const universeId = inUniverse ? workspace?.universe.id : undefined
  const requested = universeId ?? 'all'
  const [state, setState] = useState<LoadState | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [moveError, setMoveError] = useState<string | null>(null)
  const isMoving = useRef(false)
  // Writing is the one family with an order of the author's own: the stories' (#272 follow-up). The rest stay by update.
  const reorderable = section === WRITING_PROJECTS && universeId !== undefined

  const heading = section ? sectionLabel(section) : t('projects.list.title')
  useDocumentTitle(heading)

  useEffect(() => {
    const controller = new AbortController()
    // Every page, not the first: this screen is where the projects the sidebar leaves out are found (#198).
    Promise.all([
      listAllProjects(universeId ? { universeId } : {}, controller.signal),
      reorderable && universeId // The order is a nicety: a refused read leaves the list by update time, without the move menu.
        ? listStories(universeId, controller.signal).catch(() => null)
        : null,
    ])
      .then(([projects, stories]) =>
        setState({
          kind: 'ready',
          for: requested,
          projects: stories
            ? inStoryOrder(
                projects,
                stories.map((story) => story.id),
              )
            : projects,
          ordered: stories !== null,
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed', for: requested })
      })
    return () => controller.abort()
  }, [universeId, requested, reorderable])

  /** Moves one story one place, on screen first; the API's answer is the order kept, and a refusal puts it back. */
  async function move(project: ProjectDetail, by: -1 | 1) {
    if (state?.kind !== 'ready' || !universeId || isMoving.current) return
    const before = state.projects
    const from = before.findIndex((candidate) => candidate.id === project.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= before.length) return

    const after = [...before]
    after.splice(to, 0, ...after.splice(from, 1))
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', for: requested, projects: after, ordered: true })
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(
          `[data-project-id="${project.id}"] [data-testid="story-actions"]`,
        )
        ?.focus(),
    )
    try {
      const saved = await reorderStories(
        universeId,
        after.map((candidate) => candidate.storyId ?? candidate.id),
      )
      setState({
        kind: 'ready',
        for: requested,
        projects: inStoryOrder(
          after,
          saved.map((story) => story.id),
        ),
        ordered: true,
      })
      setAnnouncement(
        t('stories.browse.moved', { title: project.name, n: to + 1, total: after.length }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', for: requested, projects: before, ordered: true })
      setMoveError(error instanceof ApiError ? error.message : t('stories.browse.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  if (state === null || state.for !== requested) {
    return <p className="projects__lede">{t('projects.list.loading')}</p>
  }

  if (state.kind === 'failed') {
    return <EmptyState title={t('projects.list.failed')} testId="projects-failed" />
  }

  const shown = kinds
    ? state.projects.filter((project) => kinds.includes(project.kind))
    : state.projects

  return (
    <section className="projects" data-testid="projects-page">
      {/* The head every other workspace screen uses, so Projects reads as one of them (#184). */}
      <PageHeader
        title={heading}
        lede={t('projects.list.lede')}
        actions={
          /*
           * Only inside a universe: a project belongs to exactly one, so the account-level list has no universe to put
           * a new project in and does not pretend otherwise (#172). The universe's own Projects screen is one click
           * away from any row here.
           */
          universeId ? (
            <Link
              className="button"
              to={`/app/projects/new?universeId=${universeId}`}
              data-testid="projects-page-new"
            >
              {t('projects.nav.new')}
            </Link>
          ) : null
        }
      />

      <p className="visually-hidden" role="status" data-testid="projects-announcement">
        {announcement}
      </p>
      {moveError ? (
        <p className="form__message" role="alert" data-testid="projects-move-error">
          {moveError}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState
          title={t('projects.list.empty')}
          hint={t('projects.list.emptyHint')}
          testId="projects-empty"
        />
      ) : (
        <ul className="storylist" data-testid="projects-list">
          {shown.map((project, index) => (
            <li
              className="storyrow"
              key={project.id}
              data-testid="projects-item"
              data-project-id={project.id}
            >
              <Link
                className="storyrow__title"
                to={projectRowPath(project)}
                data-testid={`projects-row-${project.id}`}
              >
                <bdi>{project.name}</bdi>
              </Link>
              <p className="storyrow__meta">
                <span>{kindLabel(project.kind)}</span>
                <span>{lifecycleLabel(project.lifecycle)}</span>
                <span>{project.universe.name}</span>
                {reorderable && state.ordered && access.editContent && shown.length > 1 ? (
                  <ActionMenu
                    className="storyrow__menu"
                    label={t('stories.browse.moreActions', { title: project.name })}
                    triggerTestId="story-actions"
                  >
                    {index > 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(project, -1)}
                        data-testid="story-move-up"
                      >
                        <ActionIcon icon={ArrowUp} />
                        {t('stories.browse.moveUp')}
                      </button>
                    ) : null}
                    {index < shown.length - 1 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(project, 1)}
                        data-testid="story-move-down"
                      >
                        <ActionIcon icon={ArrowDown} />
                        {t('stories.browse.moveDown')}
                      </button>
                    ) : null}
                  </ActionMenu>
                ) : null}
              </p>
              {project.summary ? (
                <p className="storyrow__premise prose">{project.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The projects in the order the stories are in; one with no story, or not named, goes last. */
function inStoryOrder(projects: ProjectDetail[], storyIds: string[]) {
  const rank = (project: ProjectDetail) => {
    const at = storyIds.indexOf(project.storyId ?? project.id)
    return at < 0 ? storyIds.length : at
  }
  return [...projects].sort((a, b) => rank(a) - rank(b))
}
