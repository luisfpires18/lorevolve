import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { projectPath, projectSectionLabel, type ProjectSection } from '../projects/sections'
import { t } from '../i18n'

/**
 * One project's frame: a tab bar over the project's sections, then the section being read.
 *
 * The tab bar lists the same sections as the project's sidebar expansion, from the same data in `projects/sections.ts`
 * (#192). They are links, so the browser owns history and every tab is an address that can be opened in a new tab.
 * Below 60rem CSS hides the sidebar expansion, so the two are never drawn at once.
 */
export function ProjectShell({
  projectId,
  universeId,
  sections,
  story = false,
  children,
}: {
  projectId: string
  /** Set inside a universe's workspace, so each tab keeps the author inside that universe's frame. */
  universeId?: string
  sections: readonly ProjectSection[]
  /** A Story shown as a Writing Project, whose page carries its own bar of the same views (#194). */
  story?: boolean
  children: ReactNode
}) {
  return (
    <div className={story ? 'projectframe projectframe--story' : 'projectframe'}>
      <nav className="projecttabs" aria-label={t('projects.tabs.label')} data-testid="project-tabs">
        <ul className="projecttabs__list">
          {sections.map((section) => (
            <li key={section.segment}>
              <NavLink
                className="projecttabs__tab"
                to={projectPath(projectId, section.segment, universeId)}
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
      {children}
    </div>
  )
}
