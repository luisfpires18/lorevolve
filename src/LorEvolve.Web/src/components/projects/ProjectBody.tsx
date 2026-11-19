import { ComicCollections } from '../ComicCollections'
import { EmptyState } from '../EmptyState'
import { ProjectEntitiesView } from '../ProjectEntitiesView'
import { ProjectSchema } from '../ProjectSchema'
import { ProjectEntityDetailView } from '../ProjectEntityDetailView'
import { ProjectOutline } from '../ProjectOutline'
import { ProjectScript } from '../ProjectScript'
import { ProjectSeasons } from '../ProjectSeasons'
import { projectSections } from '../../projects/sections'
import { ProjectKind, type ProjectDetail } from '../../projects/types'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { useUniverseAccess } from '../../universes/access'

/** An entry's own screen, or the section's panels. */
export function ProjectBody({
  project,
  section,
  entryId,
  entitiesPath,
  typesPath,
  access,
  schemaVersion,
  setSchemaVersion,
}: {
  project: ProjectDetail
  section: ReturnType<typeof projectSections>[number]
  entryId: string | undefined
  entitiesPath: string
  typesPath: string | undefined
  access: ReturnType<typeof useUniverseAccess>
  schemaVersion: number
  setSchemaVersion: Dispatch<SetStateAction<number>>
}) {
  useI18n()

  return entryId ? (
    <div className="projectbody">
      <ProjectEntityDetailView
        key={entryId}
        projectId={project.id}
        universeId={project.universe.id}
        entityId={entryId}
        gameName={project.name}
        gameHref={entitiesPath}
      />
    </div>
  ) : (
    <div className="projectbody">
      {/*
       * One panel per view (#193). Entities holds the type cards and a type's entries (#196), Types the type editor,
       * Structure the structure and Script the text of its parts (#377). A view with no panel of its own yet says so rather than borrowing one.
       *
       * A schema write changes what the entries can offer - a new type is a type an entry can be of - so the editor and
       * the entries still share `schemaVersion`. It lives here, in the component that stays mounted while the author
       * moves between this project's views and between the Entities view's own screens.
       */}
      {section.segment === 'entities' ? (
        <ProjectEntitiesView
          projectId={project.id}
          universeId={project.universe.id}
          reloadKey={schemaVersion}
          entryHref={(entry) => `${entitiesPath}/${entry.id}`}
          typesHref={typesPath}
          onChanged={() => setSchemaVersion((version) => version + 1)}
        />
      ) : section.segment === 'types' ? (
        // The type editor, the same `ProjectSchema` Entities used to open behind "Manage types".
        <ProjectSchema
          head="page"
          projectName={project.name}
          universeId={project.universe.id}
          canEdit={access.editContent}
          projectId={project.id}
          reloadKey={schemaVersion}
          onChanged={() => setSchemaVersion((version) => version + 1)}
        />
      ) : section.segment === 'structure' &&
        /*
         * One structure under three names: a Series' seasons of episodes (#145), a Film's sequences of scenes (#146)
         * and a Comic's volumes of chapters (#147), the last of which opens pages and panels beneath a chapter. The API
         * answers 404 for any other kind, so drawing the panel there would show an author a failure for a feature their
         * project does not have.
         */
        (project.kind === ProjectKind.Series ||
          project.kind === ProjectKind.Film ||
          project.kind === ProjectKind.Comic) ? (
        /*
         * A project whose format has structure rules (#290) gets the outline; the outline draws this legacy panel itself
         * when the tree read answers 404 (no format, or one without rules yet), and under "Earlier structure" while
         * legacy rows exist.
         */
        <>
          <ProjectOutline
            key={`${project.id}-${project.format ?? ''}`}
            projectId={project.id}
            legacy={
              <ProjectSeasons
                projectId={project.id}
                universeId={project.universe.id}
                words={
                  project.kind === ProjectKind.Film
                    ? 'sequences'
                    : project.kind === ProjectKind.Comic
                      ? 'volumes'
                      : 'seasons'
                }
                pages={project.kind === ProjectKind.Comic}
              />
            }
          />
          {/* A Comic's Volumes (#297) collect its issues or chapters by reference, under the outline. */}
          {project.kind === ProjectKind.Comic ? (
            <ComicCollections universeId={project.universe.id} projectId={project.id} />
          ) : null}
        </>
      ) : section.segment === 'script' &&
        (project.kind === ProjectKind.Series ||
          project.kind === ProjectKind.Film ||
          project.kind === ProjectKind.Comic) ? (
        <ProjectScript key={project.id} projectId={project.id} universeId={project.universe.id} />
      ) : (
        <EmptyState
          title={t('projects.view.empty')}
          hint={t('projects.view.emptyHint')}
          testId={`project-view-empty-${section.segment}`}
        />
      )}
    </div>
  )
}
