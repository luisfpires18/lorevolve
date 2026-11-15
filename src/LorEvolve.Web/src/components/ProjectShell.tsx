import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { projectPath, projectSectionLabel, type ProjectSection } from '../projects/sections'
import { t } from '../i18n'

/**
 * One project's frame: a tab bar over the project's sections, then the section being read.
 *
 * The tab bar lists the same sections as the project's sidebar expansion, from the same data in `projects/sections.ts`
 * (#192). They are links, so the browser owns history and every tab is an address that can be opened in a new tab.
 * Below 60rem CSS hides the sidebar expansion, so the two are never drawn at once.
 *
 * Before the tabs, on the same row where it fits, a breadcrumb names the universe the project belongs to and the
 * project (#199). Every project belongs
 * to exactly one universe (#172), and its views are only served inside that universe's workspace.
 */
export function ProjectShell({
  projectId,
  projectName,
  universe,
  sections,
  story = false,
  children,
}: {
  projectId: string
  projectName: string
  /** The universe the project belongs to, whose workspace frames these views. */
  universe: { id: string; name: string }
  sections: readonly ProjectSection[]
  /** A Story shown as a Writing Project, whose page carries its own bar of the same views (#194). */
  story?: boolean
  children: ReactNode
}) {
  return (
    <div className={story ? 'projectframe projectframe--story' : 'projectframe'}>
      <div className="projectframe__head">
        <nav
          className="projectcrumbs"
          aria-label={t('projects.shell.breadcrumb')}
          data-testid="project-breadcrumb"
        >
          <ol className="projectcrumbs__list">
            <li>
              <Link to={`/app/universes/${universe.id}`} data-testid="project-breadcrumb-universe">
                <bdi>{universe.name}</bdi>
              </Link>
            </li>
            <li aria-current="page" data-testid="project-breadcrumb-project">
              <bdi>{projectName}</bdi>
            </li>
          </ol>
        </nav>
        <nav
          className="projecttabs"
          aria-label={t('projects.tabs.label')}
          data-testid="project-tabs"
        >
          <ul className="projecttabs__list">
            {sections.map((section) => (
              <li key={section.segment}>
                <NavLink
                  className="projecttabs__tab"
                  to={projectPath(projectId, section.segment, universe.id)}
                  data-testid={`projecttab-${section.segment}`}
                >
                  <section.icon
                    className="projecttabs__icon"
                    aria-hidden="true"
                    focusable="false"
                    strokeWidth={1.75}
                  />
                  {projectSectionLabel(section)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      {children}
    </div>
  )
}
