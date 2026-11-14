import { useEffect, useId, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight, FolderOpen, Plus } from 'lucide-react'
import { listProjects } from '../projects/api'
import {
  PROJECT_SECTIONS,
  kindLabel,
  projectPath,
  projectRowPath,
  projectSectionLabel,
} from '../projects/sections'
import type { ProjectDetail } from '../projects/types'
import { t } from '../i18n'

/**
 * The project an address is in, or null anywhere else. Both of a project's frames count, the account-level
 * `/app/projects/<id>` and the universe-scoped `/app/universes/<universeId>/projects/<id>`, because the group is drawn
 * in both and the project being read is the one that starts expanded in either. Anything below the project, as its
 * later pages will be, is still that project.
 */
function projectInPath(pathname: string) {
  const match =
    /^\/app\/projects\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(pathname) ??
    /^\/app\/universes\/[0-9a-fA-F-]{36}\/projects\/([0-9a-fA-F-]{36})(?:\/|$)/.exec(pathname)
  return match ? match[1] : null
}

/**
 * The projects an author can reach, as a group of the sidebar: All projects, the projects themselves, and New project.
 *
 * One project expands to its own pages. Only the project the author is in is expanded to begin with, because a list
 * where everything is open is a list nobody can scan; opening another is a click, and what was opened by hand stays
 * open until it is closed by hand. The disclosure is a button and every destination is a link, so the group is walked
 * with Tab and opened with Enter or Space without this component handling a single key.
 *
 * `universeId` narrows the list to one universe's projects, which is what the universe's sidebar shows. Without it the
 * list is everything the account can reach, including projects that belong to no universe at all: that is how a
 * standalone project is reached without first making a world.
 */
export function ProjectsNav({ universeId }: { universeId?: string }) {
  const { pathname } = useLocation()
  const [projects, setProjects] = useState<ProjectDetail[] | 'failed' | null>(null)
  const [opened, setOpened] = useState<Record<string, boolean>>({})
  const listId = useId()

  useEffect(() => {
    const controller = new AbortController()
    listProjects(universeId ? { universeId } : {}, controller.signal)
      .then(setProjects)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setProjects('failed')
        if (error) return
      })
    return () => controller.abort()
  }, [universeId])

  const active = projectInPath(pathname)
  const rows = projects === null || projects === 'failed' ? [] : projects

  return (
    <li className="sidebar__group" data-testid="sidebar-projects">
      <ul className="sidebar__links">
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

          // A Story shown as a Writing Project is one link to the story, with no disclosure: its pages are the story's
          // own tabs, reached on the story's screen, and #141 is what renames the first of them to Structure (#140).
          if (project.storyId) {
            return (
              <li key={project.id}>
                <NavLink
                  className="sidebar__link sidebar__link--project"
                  to={projectRowPath(project, universeId)}
                  data-testid={`project-link-${project.id}`}
                >
                  <span className="sidebar__projectname">{project.name}</span>
                  <span className="sidebar__projectkind">{kindLabel(project.kind)}</span>
                </NavLink>
              </li>
            )
          }

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
                  to={projectPath(project.id, '', universeId)}
                  end
                  data-testid={`project-link-${project.id}`}
                >
                  <span className="sidebar__projectname">{project.name}</span>
                  <span className="sidebar__projectkind">{kindLabel(project.kind)}</span>
                </NavLink>
              </div>

              {isOpen ? (
                <ul
                  className="sidebar__sublinks"
                  id={panelId}
                  data-testid={`project-pages-${project.id}`}
                >
                  {PROJECT_SECTIONS.map((section) => (
                    <li key={section.segment}>
                      <NavLink
                        className="sidebar__sublink"
                        to={projectPath(project.id, section.segment, universeId)}
                        end={section.segment === ''}
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

        <li>
          <NavLink
            className="sidebar__link"
            to={universeId ? `/app/projects/new?universeId=${universeId}` : '/app/projects/new'}
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
      </ul>
    </li>
  )
}
