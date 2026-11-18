import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { groupKey, offered, sectionLabel } from '../../universes/sections'
import { roleLabel } from '../../universes/access'
import { t } from '../../i18n'
import type { UniverseDetail } from '../../universes/types'
import type { Section } from '../../universes/sections'
import type { useWorkspaceNav } from '../../universes/useWorkspaceNav'

const GROUP_TEST_IDS = {
  worldBuilding: 'sidebar-world-building',
  creation: 'sidebar-creation',
  management: 'sidebar-upkeep',
} as const

/** A group's name, drawn as a heading so a screen reader reads it as the group's name and can jump between them. */
function GroupLabel({ id, label }: { id: string; label: string }) {
  return (
    // The small muted capitals the type switcher already uses for its row labels; no new style (#191).
    <h2 className="sidebar__grouphead" id={id}>
      {label}
    </h2>
  )
}

/** The universe's sidebar: the way back to every universe, its name and role, and its sections in their groups. */
export function WorkspaceSidebar({
  universe,
  artwork,
  shared,
  groups,
  section,
  isNavOpen,
  setNavOpenAt,
  navId,
  navRef,
}: Pick<ReturnType<typeof useWorkspaceNav>, 'isNavOpen' | 'setNavOpenAt' | 'navId' | 'navRef'> & {
  universe: UniverseDetail
  artwork: string | null
  shared: boolean
  groups: { source: readonly Section[]; items: ReturnType<typeof offered> }[]
  section: Section
}) {
  return (
    <nav
      className="sidebar"
      id={navId}
      ref={navRef}
      data-open={isNavOpen ? 'true' : 'false'}
      aria-label={t('workspace.rail.universe')}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isNavOpen) setNavOpenAt(null)
      }}
    >
      <div className="sidebar__head">
        <Link className="sidebar__back" to="/app">
          <ArrowLeft
            className="sidebar__backicon"
            aria-hidden="true"
            focusable="false"
            strokeWidth={1.75}
          />
          {t('workspace.rail.allUniverses')}
        </Link>
        {/* The world's artwork in miniature beside its name, when its owner has given it one. Decorative. */}
        <div className="sidebar__identity">
          {artwork ? (
            <img
              className="sidebar__art"
              src={artwork}
              alt=""
              width={44}
              height={44}
              decoding="async"
            />
          ) : null}
          {/* A name, not the screen's heading: each screen's own title is its h1. */}
          <p className="sidebar__name" data-testid="workspace-name">
            <bdi>{universe.name}</bdi>
          </p>
        </div>
        {shared ? (
          <span className="sidebar__role" data-testid="workspace-role">
            {t('workspace.rail.sharedAs', { role: roleLabel(universe.accessRole) })}
          </span>
        ) : null}
        {universe.isArchived ? (
          <span className="sidebar__archived">{t('workspace.rail.archived')}</span>
        ) : null}
      </div>

      <ul className="sidebar__nav">
        {/* The universe's own sections: the front page, world building, creation, and management last - set apart
              at the foot. */}
        {groups.map(({ source, items }) => {
          const key = groupKey(source)
          const isManagement = key === 'management'
          const labelId = key ? `sidebar-group-${key}` : undefined
          return (
            <Fragment key={`group-${key ?? 'front'}`}>
              <li
                className={
                  isManagement ? 'sidebar__group sidebar__group--upkeep' : 'sidebar__group'
                }
                data-testid={key ? GROUP_TEST_IDS[key] : undefined}
              >
                {key && labelId ? (
                  <GroupLabel id={labelId} label={t(`workspace.rail.groups.${key}`)} />
                ) : null}
                <ul className="sidebar__links" aria-labelledby={labelId}>
                  {items.map((each) => (
                    <li key={each.segment}>
                      {/* A Link rather than a NavLink: which section is current is this component's answer, not a
                            path match, because World Logic is still the current section at a world rule's own address
                            (#152). The style keys off aria-current either way. */}
                      <Link
                        to={each.segment === '' ? '.' : each.segment}
                        className="sidebar__link"
                        aria-current={section.testId === each.testId ? 'page' : undefined}
                        data-testid={each.testId}
                      >
                        <each.icon
                          className="sidebar__icon"
                          aria-hidden="true"
                          focusable="false"
                          strokeWidth={1.75}
                        />
                        {sectionLabel(each)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </Fragment>
          )
        })}
      </ul>
    </nav>
  )
}
