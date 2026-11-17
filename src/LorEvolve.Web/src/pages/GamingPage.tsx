import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus } from 'lucide-react'
import { Link, useOutletContext } from 'react-router-dom'
import { ActionIcon } from '../components/ActionIcon'
import { ActionMenu } from '../components/ActionMenu'
import { CoverDrawer } from '../components/CoverDrawer'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ShelfCard, shelfStep } from '../components/ShelfCard'
import { pictureUrl, projectCoverStore } from '../covers/api'
import { t, useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { listAllProjects, reorderProjects } from '../projects/api'
import { formatLabel, lifecycleLabel, projectRowPath } from '../projects/sections'
import { ProjectKind, type ProjectDetail } from '../projects/types'
import { useUniverseAccess } from '../universes/access'
import { GAMING, sectionLabel } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; games: ProjectDetail[] } | { kind: 'failed' }

/**
 * The games made in this universe, each in its handheld (owner, 2026-11-17). The Writing page's mirror: the same shelf,
 * the same ⋯ menu with Cover and Move up / Move down, the same optimistic move that puts a refused one back. Only the
 * frame and the source differ: Game projects here, stories there.
 */
export default function GamingPage() {
  useI18n()
  const access = useUniverseAccess()
  const { universe } = useOutletContext<WorkspaceContext>()
  const heading = sectionLabel(GAMING)
  useDocumentTitle(heading)
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
          games: projects.filter((project) => project.kind === ProjectKind.Game),
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [universe.id])

  /** Moves one game one place, on screen first; the API's answer is the order kept, and a refusal puts it back. */
  async function move(game: ProjectDetail, by: -1 | 1) {
    if (state.kind !== 'ready' || isMoving.current) return
    const before = state.games
    const from = before.findIndex((candidate) => candidate.id === game.id)
    const to = from + by
    if (from < 0 || to < 0 || to >= before.length) return

    const after = [...before]
    after.splice(to, 0, ...after.splice(from, 1))
    isMoving.current = true
    setMoveError(null)
    setState({ kind: 'ready', games: after })
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-project-id="${game.id}"] [data-testid="game-actions"]`)
        ?.focus(),
    )
    try {
      const saved = await reorderProjects(
        universe.id,
        ProjectKind.Game,
        after.map((candidate) => candidate.id),
      )
      setState({
        kind: 'ready',
        games: saved.filter((project) => project.kind === ProjectKind.Game),
      })
      setAnnouncement(
        t('projects.gaming.moved', { name: game.name, n: to + 1, total: after.length }),
      )
    } catch (error: unknown) {
      setState({ kind: 'ready', games: before })
      setMoveError(error instanceof ApiError ? error.message : t('projects.gaming.moveFailed'))
    } finally {
      isMoving.current = false
    }
  }

  const newProject = (
    <Link
      className="button"
      to={`/app/projects/new?universeId=${universe.id}&kind=${ProjectKind.Game}`}
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

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          {t('projects.list.loading')}
        </p>
      ) : null}

      {state.kind === 'failed' ? (
        <EmptyState title={t('projects.list.failed')} testId="projects-failed" />
      ) : null}

      <p className="visually-hidden" role="status" data-testid="gaming-announcement">
        {announcement}
      </p>
      {moveError ? (
        <p className="form__message" role="alert" data-testid="gaming-move-error">
          {moveError}
        </p>
      ) : null}

      {state.kind === 'ready' && state.games.length > 0 ? (
        <ul className="shelf" data-testid="projects-list">
          {state.games.map((game, index) => (
            <ShelfCard
              key={game.id}
              frame="console"
              href={projectRowPath(game)}
              title={game.name}
              description={game.summary}
              step={shelfStep(game.lifecycle)}
              statusLabel={lifecycleLabel(game.lifecycle)}
              meta={game.format ? formatLabel(game.format) : (game.subtype ?? undefined)}
              cover={game.cover ? pictureUrl(projectCoverStore(game.id), game.cover, 'card') : null}
              openTestId={`projects-row-${game.id}`}
              attrs={{ 'data-testid': 'projects-item', 'data-project-id': game.id }}
              menu={
                access.editContent ? (
                  <ActionMenu
                    label={t('projects.common.more', { name: game.name })}
                    triggerTestId="game-actions"
                  >
                    <button
                      className="actionmenu__item"
                      type="button"
                      onClick={() => setCovering(game)}
                      data-testid="game-cover"
                    >
                      <ActionIcon icon={ImageIcon} />
                      {t('projects.common.cover')}
                    </button>
                    {index > 0 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(game, -1)}
                        data-testid="game-move-up"
                      >
                        <ActionIcon icon={ArrowUp} />
                        {t('projects.common.moveUp')}
                      </button>
                    ) : null}
                    {index < state.games.length - 1 ? (
                      <button
                        className="actionmenu__item"
                        type="button"
                        onClick={() => void move(game, 1)}
                        data-testid="game-move-down"
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

      {state.kind === 'ready' && state.games.length === 0 ? (
        <EmptyState
          title={t('projects.list.emptyGame')}
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
          store={projectCoverStore(covering.id)}
          onChanged={(cover) => {
            setCovering({ ...covering, cover })
            setState((current) =>
              current.kind === 'ready'
                ? {
                    kind: 'ready',
                    games: current.games.map((one) =>
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
