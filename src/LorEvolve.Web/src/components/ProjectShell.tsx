import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { PageHeader } from './PageHeader'
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
  facts,
  children,
}: {
  projectId: string
  projectName: string
  /** The universe the project belongs to, whose workspace frames these views. */
  universe: { id: string; name: string }
  sections: readonly ProjectSection[]
  /**
   * A Story shown as a Writing Project (#194). Its page carries its own header and bar of the same views, so the shell
   * draws neither breadcrumb nor tabs: two bars of the same links were double navigation.
   */
  story?: boolean
  /**
   * A kind with no Overview (a Game, owner 2026-11-17): the project heads its own page, its name over its facts and
   * summary as Lore's page is headed, and its views are a row of Lore's group chips instead of a breadcrumb and tabs.
   */
  facts?: { lede: ReactNode; summary: ReactNode }
  children: ReactNode
}) {
  return (
    <div className={story ? 'projectframe projectframe--story' : 'projectframe'}>
      {facts ? (
        <div className="projectframe__hero" data-testid="project-facts">
          <PageHeader
            title={<bdi>{projectName}</bdi>}
            titleTestId="project-name"
            lede={facts.lede}
          />
          {facts.summary}
          <nav
            className="lorecatalog__groups"
            aria-label={t('projects.tabs.label')}
            data-testid="project-tabs"
          >
            {sections.map((section) => (
              <NavLink
                key={section.segment}
                className="lorecatalog__group"
                to={projectPath(projectId, section.segment, universe.id)}
                data-testid={`projecttab-${section.segment}`}
              >
                <section.icon
                  className="lorecatalog__groupicon"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                />
                {projectSectionLabel(section)}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : story ? null : (
        <div className="projectframe__head">
          <div className="pageheader__crumb">
            <nav aria-label={t('projects.shell.breadcrumb')} data-testid="project-breadcrumb">
              <ol>
                <li>
                  <Link
                    to={`/app/universes/${universe.id}`}
                    data-testid="project-breadcrumb-universe"
                  >
                    <bdi>{universe.name}</bdi>
                  </Link>
                </li>
                <li aria-current="page" data-testid="project-breadcrumb-project">
                  <bdi>{projectName}</bdi>
                </li>
              </ol>
            </nav>
          </div>
          <nav className="views" aria-label={t('projects.tabs.label')} data-testid="project-tabs">
            {sections.map((section) => (
              <NavLink
                key={section.segment}
                className="views__link"
                to={projectPath(projectId, section.segment, universe.id)}
                data-testid={`projecttab-${section.segment}`}
              >
                {projectSectionLabel(section)}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
      {children}
    </div>
  )
}
