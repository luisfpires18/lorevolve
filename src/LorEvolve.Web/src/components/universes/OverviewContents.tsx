import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import { sectionLabel, sectionPurpose, type Section } from '../../universes/sections'
import { CardGrid } from '../CardGrid'
import { SectionTitle } from '../Section'
import { WipBadge } from '../WipBadge'

/** One group of the universe front page's contents: its heading, then a doorway into each section it offers. */
export function OverviewContents({
  name,
  sections,
}: {
  name: string
  sections: readonly Section[]
}) {
  useI18n()
  return (
    <section className={`contents contents--${name}`} aria-labelledby={`contents-${name}`}>
      <SectionTitle tone="rule" className="contents__heading" id={`contents-${name}`}>
        {t(`workspace.rail.groups.${name}` as never)}
      </SectionTitle>
      <CardGrid min={14} className="contents__list">
        {sections.map((section) => (
          <li key={section.segment}>
            <Doorway section={section} />
          </li>
        ))}
      </CardGrid>
    </section>
  )
}

/** A section's doorway: its icon, name, purpose and an arrow, all one link into the section. */
function Doorway({ section }: { section: Section }) {
  return (
    <Link className="doorway" to={section.segment} data-testid={`overview-${section.segment}`}>
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
  )
}
