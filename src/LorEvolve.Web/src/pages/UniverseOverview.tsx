import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ConnectToAi } from '../components/ConnectToAi'
import { WipBadge } from '../components/WipBadge'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../lib/dates'
import { t, tx, useI18n } from '../i18n'
import { listEntities } from '../lore/api'
import { roleDescription, roleLabel, useUniverseAccess } from '../universes/access'
import {
  offered,
  REVIEW,
  RULES,
  sectionLabel,
  sectionPurpose,
  WORLD,
  WRITING,
  type Section,
} from '../universes/sections'
import { UniverseRole } from '../universes/types'
import type { WorkspaceContext } from './UniverseWorkspace'

/** The contents page's parts: the sidebar's worldbuilding groups, between the front page and the upkeep. */
const CONTENTS = [
  { heading: 'world', name: 'world', sections: WORLD },
  { heading: 'rules', name: 'rules', sections: RULES },
  { heading: 'writing', name: 'writing', sections: WRITING },
  { heading: 'review', name: 'review', sections: REVIEW },
]

/**
 * A universe's front page, set as a book's contents: its name and opening line, then a doorway into
 * each part of it, grouped as the sidebar groups them. No feed, no recent items, no counts - a
 * count would mean reading every list just to print a number, and a contents page does not need
 * one to say where things are.
 *
 * One question is asked, of someone who can write here: is there any lore at all? A world with none
 * gets a line saying where to begin, above the contents.
 *
 * The world's parts take the full width; the shorter groups sit side by side once there is room.
 */
export default function UniverseOverview() {
  useI18n()
  const { universe } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const shared = universe.accessRole !== UniverseRole.Owner
  const canWrite = access.editContent

  // Which universe was found to have no lore; another universe's answer never shows on this one.
  const [emptyId, setEmptyId] = useState<string | null>(null)
  useEffect(() => {
    if (!canWrite) return
    const controller = new AbortController()
    listEntities(
      universe.id,
      { search: '', entityTypeId: null, canonStatus: null, tag: null, page: 1, pageSize: 1 },
      controller.signal,
    )
      .then((entries) => setEmptyId(entries.totalCount === 0 ? universe.id : null))
      // The line is a hint; without an answer the contents stand by themselves.
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [universe.id, canWrite])

  const groups = CONTENTS.map((group) => ({
    ...group,
    sections: offered(group.sections, access, universe.aiHelp),
  })).filter(({ sections }) => sections.length > 0)
  const [world, ...rest] = groups

  return (
    <article className="overview">
      <PageHeader
        title={<bdi>{universe.name}</bdi>}
        titleTestId="overview-name"
        titleClassName="titlerule"
        // An outside AI app reading this universe over MCP (ADR 0046): any member may connect their own, so every
        // member's front page offers it.
        actions={
          universe.aiHelp ? (
            <ConnectToAi universeId={universe.id} universeName={universe.name} />
          ) : undefined
        }
        lede={
          <>
            {universe.description ? (
              <p className="overview__description prose">{universe.description}</p>
            ) : shared ? (
              <p className="overview__description">{t('workspace.overview.noDescription')}</p>
            ) : (
              <p className="overview__description">
                {tx('workspace.overview.noDescriptionOwn', {
                  settings: (
                    <Link to="settings">{t('workspace.overview.noDescriptionSettings')}</Link>
                  ),
                })}
              </p>
            )}
            <p className="overview__meta">
              {t('workspace.overview.dates', {
                created: formatDate(universe.createdAt),
                changed: formatDate(universe.updatedAt),
              })}
            </p>
            {shared ? (
              <p className="overview__meta" data-testid="overview-role">
                {t('workspace.overview.shared', {
                  role: roleLabel(universe.accessRole),
                  description: roleDescription(universe.accessRole),
                })}
              </p>
            ) : null}
          </>
        }
      />

      {canWrite && emptyId === universe.id ? (
        <p className="notice" data-testid="overview-start">
          {tx('workspace.overview.empty', {
            lore: <Link to="lore">{t('workspace.overview.emptyLore')}</Link>,
          })}
        </p>
      ) : null}

      {world ? <Contents {...world} /> : null}
      {rest.length > 0 ? (
        <div className="contents__pair">
          {rest.map((group) => (
            <Contents key={group.name} {...group} />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function Contents({
  heading,
  name,
  sections,
}: {
  heading: string
  name: string
  sections: readonly Section[]
}) {
  useI18n()
  return (
    <section className={`contents contents--${name}`} aria-labelledby={`contents-${heading}`}>
      <h2 className="contents__heading sectionrule" id={`contents-${heading}`}>
        {t(`workspace.overview.groups.${heading}` as never)}
      </h2>
      <ul className="contents__list">
        {sections.map((section) => (
          <li key={section.segment}>
            <Link
              className="doorway"
              to={section.segment}
              data-testid={`overview-${section.segment}`}
            >
              <span className="doorway__medallion" aria-hidden="true">
                <section.icon className="doorway__icon" focusable="false" strokeWidth={1.75} />
              </span>
              <span className="doorway__name">
                {sectionLabel(section)}
                {section.wip ? <WipBadge /> : null}
              </span>
              <span className="doorway__purpose">{sectionPurpose(section)}</span>
              <span className="doorway__go" aria-hidden="true">
                <ArrowRight focusable="false" strokeWidth={1.75} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
