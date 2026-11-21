import { AccountMenu } from '../AccountMenu'
import { BrandLink } from '../BrandLink'
import { sectionLabel } from '../../universes/sections'
import { t } from '../../i18n'
import type { UniverseDetail } from '../../universes/types'
import type { Section } from '../../universes/sections'
import type { useWorkspaceNav } from '../../universes/useWorkspaceNav'

/** The global rail: LorEvolve's mark, the accent seal, where this is, the Sections toggle and the account. */
export function WorkspaceRail({
  universe,
  section,
  pathname,
  isNavOpen,
  setNavOpenAt,
  navId,
  toggleRef,
}: Pick<
  ReturnType<typeof useWorkspaceNav>,
  'isNavOpen' | 'setNavOpenAt' | 'navId' | 'toggleRef'
> & {
  universe: UniverseDetail
  section: Section
  pathname: string
}) {
  return (
    <nav className="rail" aria-label={t('workspace.rail.brand')}>
      {/* The drawn L, deliberately, and not the LorEvolve symbol. The symbol was tried here: at
            the ~30px this rail allows it reads as a red tangle rather than a sphere, and it
            puts the only saturated colour in the chrome directly above the universe's accent
            seal - which is the one thing in the rail that carries meaning. The mark is shown
            large on the auth plate and small in the paper bars instead. */}
      {/* LorEvolve's mark leads to LorEvolve's home, from everywhere (031), and its name says so. The universes are "All
            universes", at the head of the sidebar and of the phone's Sections sheet; the account menu at the rail's
            foot names Explore and My workspace. The glyph stays small and its target does not: a 40px square, the
            rail's own width less its margins. */}
      <BrandLink className="rail__mark" glyph="L" />
      <span className="rail__seal" aria-hidden="true" />

      {/* Only rendered into the narrow layout, where the sidebar head is folded away:
            the bar has to keep saying which universe and which section this is. The name carries its own
            direction rather than a <bdi>, because it is cut with an ellipsis: only the clipping element's
            direction puts the cut at the end of a name written right to left, not at its start. */}
      <p className="rail__where" data-testid="workspace-where">
        <span className="rail__universe" dir="auto" title={universe.name}>
          {universe.name}
        </span>
        <span className="rail__section">{sectionLabel(section)}</span>
        {universe.isArchived ? (
          <span className="rail__archived">{t('workspace.rail.archived')}</span>
        ) : null}
      </p>

      <button
        className="rail__toggle"
        type="button"
        ref={toggleRef}
        aria-expanded={isNavOpen}
        aria-controls={navId}
        onClick={() => setNavOpenAt(isNavOpen ? null : pathname)}
        data-testid="workspace-nav-toggle"
      >
        {isNavOpen ? t('workspace.rail.close') : t('workspace.rail.sections')}
      </button>

      {/* The account lives on the global rail, not in the sidebar: the sidebar is this
            universe's sections, and an account is not one of them.

            Last in the list, and on a wide screen pushed to the foot of the rail rather than
            tucked under the "L". The mark and the accent seal are a pair - LorEvolve, and which world
            this is - and putting a third circle between them would read as a third piece of the
            same statement. At the foot it is where a global rail's account always is, and out of
            the way of the one thing the rail is for.

            On a narrow screen the rail is the sticky bar, this row is horizontal, and the same
            node lands at the right-hand end - so the account is reachable on a phone without a
            second account UI existing anywhere. */}
      <AccountMenu variant="rail" />
    </nav>
  )
}
