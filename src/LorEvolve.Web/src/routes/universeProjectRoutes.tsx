import { Route } from 'react-router-dom'
import { ProjectKind } from '../projects/types'
import { CINEMA, COMIC, GAME_ENTITIES, GAMING } from '../universes/sections'
import { StoryRedirect } from '../components/StoryRedirect'
import {
  GameEntitiesPage,
  CategoryShelfPage,
  GameEntityPage,
  ProjectPage,
  ProjectsDirectory,
  ProjectsPage,
  StoriesPage,
} from '../screens'
import { asSection } from './screenHolds'
import { StoriesToWriting } from './redirects'

/** The kinds on each Creation shelf, kept stable so the shelf reads its projects once. */
const GAMING_KINDS = [ProjectKind.Game]
const CINEMA_KINDS = [ProjectKind.Film, ProjectKind.Series]
const COMIC_KINDS = [ProjectKind.Comic]

export function universeProjectRoutes() {
  return (
    <>
      <Route path="projects" element={asSection('projects', <ProjectsDirectory />)} />
      {/* The Creation and Game Entities destinations: the project list narrowed to their kinds (#272). */}
      <Route path="writing" element={asSection('stories', <StoriesPage />)} />
      <Route
        path="gaming"
        element={asSection(
          'projects',
          <CategoryShelfPage
            key="gaming"
            section={GAMING}
            kinds={GAMING_KINDS}
            frame="console"
            empty="projects.list.emptyGame"
          />,
        )}
      />
      <Route
        path="cinema"
        element={asSection(
          'projects',
          <CategoryShelfPage
            key="cinema"
            section={CINEMA}
            kinds={CINEMA_KINDS}
            frame="film"
            empty="projects.list.emptyCinema"
            view="sagas"
          />,
        )}
      />
      <Route
        path="comic"
        element={asSection(
          'projects',
          <CategoryShelfPage
            key="comic"
            section={COMIC}
            kinds={COMIC_KINDS}
            frame="comic"
            empty="projects.list.emptyComic"
            view="arcs"
          />,
        )}
      />
      <Route
        path="game-entities"
        element={asSection(
          'projects',
          <ProjectsPage
            inUniverse
            section={GAME_ENTITIES}
            kinds={[ProjectKind.Game]}
            rowPath={(project) =>
              `/app/universes/${project.universe.id}/game-entities/${project.id}`
            }
          />,
        )}
      />
      <Route
        path="game-entities/:projectId"
        element={asSection('projects', <GameEntitiesPage />)}
      />
      <Route
        path="game-entities/:projectId/:entityId"
        element={asSection('projects', <GameEntityPage />)}
      />
      <Route
        path="projects/:projectId/*"
        element={asSection('project', <ProjectPage inUniverse />)}
      />
      {/*
       * A Story shown as a Writing Project opens its project shell like any other kind, and the shell renders
       * the story's own page, which reads `storyId` and `sceneId` from the address (#194). These three routes
       * carry those names; any other project reached through one reads it as that view. Every element below is
       * the same `ProjectPage`, so moving between views keeps the page, as the story's own routes did.
       */}
      <Route
        path="projects/:storyId/structure"
        element={asSection('project', <ProjectPage inUniverse view="structure" />)}
      />
      <Route
        path="projects/:storyId/manuscript/:sceneId?"
        element={asSection('project', <ProjectPage inUniverse view="manuscript" />)}
      />
      <Route path="stories" element={<StoriesToWriting />} />
      {/*
       * Until #194 a story's pages lived here. Every one of these addresses still resolves, by a redirect to the
       * story's project views that keeps the scene id, the query and the hash (a `#scene-` link lands on its
       * scene). The Plot view was retired with plot beats (ADR 0070), so its old link lands on the Structure.
       */}
      <Route path="stories/:storyId" element={<StoryRedirect to="structure" />} />
      <Route path="stories/:storyId/plot" element={<StoryRedirect to="structure" />} />
      <Route
        path="stories/:storyId/manuscript/:sceneId?"
        element={<StoryRedirect to="manuscript" />}
      />
    </>
  )
}
