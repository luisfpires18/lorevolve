import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import { Section } from './Section'
import { ViewChips } from './ViewChips'
import { projectPath, projectSectionLabel, type ProjectSection } from '../projects/sections'
import { t } from '../i18n'

/**
 * One project's frame: the project's own head, then the section being read.
 *
 * Every kind heads its page the same way (#377): the project's name over its facts and summary, as Lore's page is
 * headed, then its views as a row of Lore's group chips. The chips list the same sections as the project's sidebar
 * expansion, from the same data in `projects/sections.ts` (#192). There is no breadcrumb: the workspace already names
 * the universe.
 */
export function ProjectShell({
  projectId,
  projectName,
  universe,
  sections,
  facts,
  children,
}: {
  projectId: string
  projectName: string
  /** The universe the project belongs to, whose workspace frames these views. */
  universe: { id: string; name: string }
  sections: readonly ProjectSection[]
  /**
   * The project's facts line and summary, drawn under its name. A Story shown as a Writing Project (#194) passes none: its
   * page carries its own header and the same chips, so the shell draws no head of its own, as two rows of the same links
   * were double navigation.
   */
  facts?: { lede: ReactNode; summary: ReactNode }
  children: ReactNode
}) {
  return (
    <>
      {facts ? (
        <Section testId="project-facts">
          <PageHeader
            title={<bdi>{projectName}</bdi>}
            titleTestId="project-name"
            lede={facts.lede}
          />
          {facts.summary}
          <ViewChips
            label={t('projects.tabs.label')}
            testId="project-tabs"
            items={sections.map((section) => ({
              to: projectPath(projectId, section.segment, universe.id),
              label: projectSectionLabel(section),
              icon: section.icon,
              testId: `projecttab-${section.segment}`,
            }))}
          />
        </Section>
      ) : null}
      {children}
    </>
  )
}
