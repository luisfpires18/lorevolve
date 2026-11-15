import { useEffect, useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, FolderOpen, Plus } from 'lucide-react'
import { listProjects } from '../projects/api'
import {
  kindLabel,
  projectFrameUniverse,
  projectPath,
  projectRowPath,
  projectSectionLabel,
  projectSections,
} from '../projects/sections'
import type { ProjectDetail } from '../projects/types'
import { t } from '../i18n'

/**
 * How many projects the sidebar lists, most recently updated first, before the rest are left to All projects (#198).
 * The issue proposed eight and the owner has not confirmed it, so it lives here alone: changing it is this one line.
 */
export const SIDEBAR_PROJECT_LIMIT = 8

/**
 * The project an address is in, or null anywhere else. Both of a project's frames count, the account-level
 * `/app/projects/<id>` and the universe-scoped `/app/universes/<universeId>/projects/<id>`, because the group is drawn
 * in both and the project being read is the one that starts expanded in either. Anything below the project, as its
 * later pages will be, is still that project. A story's own address counts too, because a story is the Writing Project
 * it is listed as (#140), and the list must keep the one being read even when it is past the bound (#198).
 */
function projectInPath(pathname: string) {
  const match =
    /^\/app\/projects\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(pathname) ??
    /^\/app\/universes\/[0-9a-fA-F-]{36}\/(?:projects|stories)\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(
      pathname,
    )
  return match ? match[1] : null
}

/**
 * The projects an author can reach, as a group of the sidebar: All projects, the projects themselves, and New project.
 *
 * The list is bounded: the `SIDEBAR_PROJECT_LIMIT` most recently updated, plus the project the author is in when it is
 * older than those, so forty projects still draw a sidebar that can be read and a request that stays small (#198). The
 * rest are one click away under All projects. The group's own heading folds the whole group away.
 *
 * One project expands to its own pages. Only the project the author is in is expanded to begin with, because a list
 * where everything is open is a list nobody can scan; opening another is a click, and what was opened by hand stays
 * open until it is closed by hand. The disclosure is a button and every destination is a link, so the group is walked
 * with Tab and opened with Enter or Space without this component handling a single key.
 *
 * `universeId` narrows the list to one universe's projects, which is what the universe's sidebar shows. Without it the
 * list is every project of every universe the account can reach, which is all of them: a project belongs to exactly
 * one universe (#172).
 */
export function ProjectsNav({ universeId }: { universeId?: string }) {
  const { pathname } = useLocation()
  const [projects, setProjects] = useState<ProjectDetail[] | 'failed' | null>(null)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const [groupOpen, setGroupOpen] = useState(true)
  const listId = useId()
  const active = projectInPath(pathname)

  useEffect(() => {
    const controller = new AbortController()
    listProjects(
      { universeId, limit: SIDEBAR_PROJECT_LIMIT, include: active ?? undefined },
      controller.signal,
    )
      .then((next) => {
        setProjects(next)
        // What was opened by hand is kept only for rows still listed, so the record never outgrows the list.
        setOpened((current) =>
          Object.fromEntries(
            next.filter((row) => row.id in current).map((row) => [row.id, current[row.id]]),
          ),
        )
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProjects('failed')
        if (error) return
      })
    return () => controller.abort()
  }, [universeId, active])

  const rows = projects === null || projects === 'failed' ? [] : projects
  const linksId = `${listId}-links`

  return (
    <li className="sidebar__group" data-testid="sidebar-projects">
      {/* The group's label is its fold: one button, announced as expanded or collapsed, named by the label it shows. */}
      <h2 className="typeswitch__rowlabel sidebar__grouphead" id="sidebar-group-projects">
        <button
          type="button"
          className="sidebar__grouptoggle"
          aria-expanded={groupOpen}
          aria-controls={linksId}
          data-testid="projects-group-toggle"
          onClick={() => setGroupOpen((open) => !open)}
        >
          <ChevronRight
            className={groupOpen ? 'sidebar__chevron sidebar__chevron--open' : 'sidebar__chevron'}
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
          />
          {t('workspace.rail.groups.projects')}
        </button>
      </h2>
      <ul
        className="sidebar__links"
        id={linksId}
        aria-labelledby="sidebar-group-projects"
        hidden={!groupOpen}
      >
        <li>
          {/*
           * A project's own pages live at one address, `/app/projects/<id>`, because a project may have no universe
           * and must never have two addresses. Only the list is shown where the author is: inside a universe it is
           * that universe's list, in the workspace it is everything.
           */}
          <NavLink
            className="sidebar__link"
            to={universeId ? `/app/universes/${universeId}/projects` : '/app/projects'}
            end
            data-testid="projects-all"
          >
            <FolderOpen
              className="sidebar__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            {t('projects.nav.all')}
          </NavLink>
        </li>

        {rows.map((project) => {
          const isOpen = opened[project.id] ?? project.id === active
          const panelId = `${listId}-${project.id}`

          // #140 gave a Story shown as a Writing Project one link to the story and no disclosure, because its pages were
          // the story's own tabs on the story's screen. Since #194 the project shell renders those same views, so its row
          // expands like every other project's, to the story's Structure, Manuscript and Ideas.
          const frame = projectFrameUniverse(project, universeId)

          return (
            <li key={project.id}>
              <div className="sidebar__projectrow">
                <button
                  type="button"
                  className="sidebar__disclosure"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  data-testid={`project-toggle-${project.id}`}
                  onClick={() => setOpened((current) => ({ ...current, [project.id]: !isOpen }))}
                >
                  <ChevronRight
                    className={
                      isOpen ? 'sidebar__chevron sidebar__chevron--open' : 'sidebar__chevron'
                    }
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                  />
                  <span className="visually-hidden">
                    {isOpen ? t('projects.nav.collapse') : t('projects.nav.expand')}
                  </span>
                </button>
                <NavLink
                  className="sidebar__link sidebar__link--project"
                  to={projectRowPath(project, universeId)}
                  data-testid={`project-link-${project.id}`}
                >
                  <span className="sidebar__projectname">{project.name}</span>
                  <span className="sidebar__projectkind">{kindLabel(project.kind)}</span>
                </NavLink>
              </div>

              {isOpen ? (
                // Below 60rem the project's tab bar carries these same destinations, so CSS hides this list there and the
                // two are never drawn at once.
                <ul
                  className="sidebar__sublinks sidebar__sublinks--project"
                  id={panelId}
                  data-testid={`project-pages-${project.id}`}
                >
                  {projectSections(project.kind, project.storyId).map((section) => (
                    <li key={section.segment}>
                      <NavLink
                        className="sidebar__sublink"
                        to={projectPath(project.id, section.segment, frame)}
                        data-testid={`${section.testId}-${project.id}`}
                      >
                        <section.icon
                          className="sidebar__icon"
                          aria-hidden="true"
                          focusable="false"
                          strokeWidth={1.75}
                        />
                        {projectSectionLabel(section)}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}

        {/* New project only where the universe it would belong to is known (#172). */}
        {universeId ? (
          <li>
            <NavLink
              className="sidebar__link"
              to={`/app/projects/new?universeId=${universeId}`}
              data-testid="projects-new"
            >
              <Plus
                className="sidebar__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
              {t('projects.nav.new')}
            </NavLink>
          </li>
        ) : null}
      </ul>
    </li>
  )
}
