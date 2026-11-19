import { useOutletContext, useSearchParams } from 'react-router-dom'
import { CoverDrawer } from '../components/CoverDrawer'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import type { ShelfFrame } from '../components/ShelfCard'
import { projectCoverStore } from '../covers/api'
import { t, useI18n } from '../i18n'
import type { ProjectKindValue } from '../projects/types'
import { useUniverseAccess } from '../universes/access'
import { sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'
import { shelfActions } from '../projects/shelfActions'
import { VIEWS } from '../projects/shelfViews'
import { useShelfRead } from '../projects/useShelfRead'
import { useShelfState } from '../projects/useShelfState'
import { ShelfCards } from '../components/projects/ShelfCards'
import { ShelfViewNav } from '../components/projects/ShelfViewNav'
import { NewButton } from '../components/NewButton'
import { Announce } from '../components/Announce'
import { LoadingNote } from '../components/LoadingNote'
import { LoadError } from '../components/LoadError'

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
  const [params] = useSearchParams()
  const views = view ? VIEWS[view] : null
  const showView = view !== undefined && params.get('view') === view
  const shelf = useShelfState()
  const { state, setState, announcement, moveError, covering, setCovering } = shelf

  useShelfRead({ ...shelf, universe, kinds })

  const { neighbour, move } = shelfActions({ ...shelf, universe, kinds })

  const newProject = (
    <NewButton
      to={`/app/projects/new?universeId=${universe.id}&kind=${kinds[0]}`}
      data-testid="projects-page-new"
    >
      {t('projects.nav.new')}
    </NewButton>
  )

  return (
    <article className="stories" data-testid="projects-page">
      <PageHeader
        title={heading}
        lede={t('projects.list.lede')}
        actions={access.editContent ? newProject : null}
      />

      {views ? <ShelfViewNav views={views} view={view} showView={showView} /> : null}

      {views && showView ? <views.Body universeId={universe.id} /> : null}

      {!showView && state.kind === 'loading' ? (
        <LoadingNote>{t('projects.list.loading')}</LoadingNote>
      ) : null}

      {!showView && state.kind === 'error' ? (
        <LoadError
          message={t('projects.list.failed')}
          onRetry={shelf.retry}
          testId="projects-failed"
        />
      ) : null}

      <Announce testId="shelf-announcement">{announcement}</Announce>
      {moveError ? (
        <p className="form__message" role="alert" data-testid="shelf-move-error">
          {moveError}
        </p>
      ) : null}

      {!showView && state.kind === 'ready' && state.value.length > 0 ? (
        <ShelfCards
          frame={frame}
          kinds={kinds}
          state={state}
          access={access}
          setCovering={setCovering}
          neighbour={neighbour}
          move={move}
        />
      ) : null}

      {!showView && state.kind === 'ready' && state.value.length === 0 ? (
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
                    value: current.value.map((one) =>
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
