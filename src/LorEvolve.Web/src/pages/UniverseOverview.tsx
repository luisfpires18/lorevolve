import { Link, useOutletContext } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ConnectToAi } from '../components/ConnectToAi'
import { WipBadge } from '../components/WipBadge'
import { PageHeader } from '../components/PageHeader'
import { formatDate } from '../lib/dates'
import { ROLE_DESCRIPTIONS, ROLE_LABELS, useUniverseAccess } from '../universes/access'
import { offered, REVIEW, RULES, WORLD, WRITING, type Section } from '../universes/sections'
import { UniverseRole } from '../universes/types'
import type { WorkspaceContext } from './UniverseWorkspace'

/** The contents page's parts: the sidebar's worldbuilding groups, between the front page and the upkeep. */
const CONTENTS = [
  { heading: 'World', name: 'world', sections: WORLD },
  { heading: 'Rules', name: 'rules', sections: RULES },
  { heading: 'Writing', name: 'writing', sections: WRITING },
  { heading: 'Review', name: 'review', sections: REVIEW },
]

/**
 * A universe's front page, set as a book's contents: its name and opening line, then a doorway into
 * each part of it, grouped as the sidebar groups them. No feed, no recent items, no counts - a
 * count would mean reading every list just to print a number, and a contents page does not need
 * one to say where things are.
 *
 * The world's parts take the full width; the shorter groups sit side by side once there is room.
 */
export default function UniverseOverview() {
  const { universe } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()
  const shared = universe.accessRole !== UniverseRole.Owner

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
              <p className="overview__description">No description yet.</p>
            ) : (
              <p className="overview__description">
                No description yet. <Link to="settings">Settings</Link> is where you give this world
                its opening line.
              </p>
            )}
            <p className="overview__meta">
              Created {formatDate(universe.createdAt)}, last changed{' '}
              {formatDate(universe.updatedAt)}
            </p>
            {shared ? (
              <p className="overview__meta" data-testid="overview-role">
                Shared with you as {ROLE_LABELS[universe.accessRole]}.{' '}
                {ROLE_DESCRIPTIONS[universe.accessRole]}
              </p>
            ) : null}
          </>
        }
      />

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
  return (
    <section className={`contents contents--${name}`} aria-labelledby={`contents-${heading}`}>
      <h2 className="contents__heading sectionrule" id={`contents-${heading}`}>
        {heading}
      </h2>
      <ul className="contents__list">
        {sections.map(({ segment, label, icon: Icon, purpose, wip }) => (
          <li key={segment}>
            <Link className="doorway" to={segment} data-testid={`overview-${segment}`}>
              <span className="doorway__medallion" aria-hidden="true">
                <Icon className="doorway__icon" focusable="false" strokeWidth={1.75} />
              </span>
              <span className="doorway__name">
                {label}
                {wip ? <WipBadge /> : null}
              </span>
              <span className="doorway__purpose">{purpose}</span>
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
