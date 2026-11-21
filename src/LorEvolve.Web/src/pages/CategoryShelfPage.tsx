import { useOutletContext, useSearchParams } from 'react-router-dom'
import { CoverDrawer } from '../components/CoverDrawer'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { ShelfCard, shelfStep, type ShelfFrame } from '../components/ShelfCard'
import { pictureUrl, projectCoverStore } from '../covers/api'
import {
  formatLabel,
  kindLabel,
  lifecycleLabel,
  newProjectPath,
  projectRowPath,
} from '../projects/sections'
import { t, useI18n } from '../i18n'
import type { ProjectKindValue } from '../projects/types'
import { useUniverseAccess } from '../universes/access'
import { sectionLabel, type Section } from '../universes/sections'
import type { WorkspaceContext } from './UniverseWorkspace'
import { shelfActions, withCover } from '../projects/shelfActions'
import { shelfCoverChange } from '../projects/shelfCover'
import { shelfNotices } from '../projects/shelfNotices'
import { VIEWS } from '../projects/shelfViews'
import { useShelfState } from '../projects/useShelfState'
import { CardGrid } from '../components/CardGrid'
import { ViewLinks } from '../components/ViewLinks'
import { NewButton } from '../components/NewButton'
import { ReadGate } from '../components/ReadGate'

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
  const shelf = useShelfState(universe.id, kinds)
  const { state, setState, announcement, moveError, covering, setCovering } = shelf

  const { neighbour, move } = shelfActions({ ...shelf, universe, kinds })

  const newProject = (
    <NewButton to={newProjectPath(universe.id, kinds[0])} data-testid="projects-page-new">
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

      {views ? (
        <ViewLinks
          label={t(`projects.${views.words}.viewsLabel`)}
          testId={`${views.testId}-views`}
          items={[
            {
              to: '?',
              label: t(`projects.${views.words}.projectsView`),
              current: !showView,
              testId: `${views.testId}-view-projects`,
            },
            {
              to: `?view=${view}`,
              label: t(`projects.${views.words}.${views.second}` as 'projects.sagas.sagasView'),
              current: showView,
              testId: views.secondTestId,
            },
          ]}
        />
      ) : null}

      {views && showView ? <views.Body universeId={universe.id} /> : null}

      {/* The cards sit below the notices, so the gate draws only the loading and failed lines here. */}
      {!showView ? (
        <ReadGate
          load={state}
          loading={{ text: t('projects.list.loading') }}
          error={{
            message: t('projects.list.failed'),
            onRetry: shelf.retry,
            testId: 'projects-failed',
          }}
        >
          {() => null}
        </ReadGate>
      ) : null}

      {shelfNotices(
        { announcement, moveError },
        { announcement: 'shelf-announcement', moveError: 'shelf-move-error' },
      )}

      {!showView && state.kind === 'ready' && state.value.length > 0 ? (
        // A handheld and a strip of film lie on their side, so their grid has wider places.
        <CardGrid
          min={frame === 'console' || frame === 'film' ? 17 : 15}
          gap={5}
          testId="projects-list"
        >
          {state.value.map((project, index, projects) => (
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
              attrs={{
                'data-testid': 'projects-item',
                'data-project-id': project.id,
                'data-kind': String(project.kind),
              }}
              menuLabel={
                access.editContent ? t('projects.common.more', { name: project.name }) : undefined
              }
              onCover={access.editContent ? () => setCovering(project) : undefined}
              move={{
                first: neighbour(projects, index, -1) < 0,
                last: neighbour(projects, index, 1) < 0,
                onMove: (step) => void move(project, step),
              }}
            />
          ))}
        </CardGrid>
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
          onChanged={shelfCoverChange(covering, setCovering, (id, cover) =>
            setState((current) =>
              current.kind === 'ready'
                ? { kind: 'ready', value: withCover(current.value, id, cover) }
                : current,
            ),
          )}
          onClose={() => setCovering(null)}
        />
      ) : null}
    </article>
  )
}
