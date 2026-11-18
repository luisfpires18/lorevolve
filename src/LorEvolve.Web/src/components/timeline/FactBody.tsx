import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { t, useI18n } from '../../i18n'
import { FieldSemantic } from '../../lore/fieldKinds'
import type { TimelineItem } from '../../timeline/types'
import { TypeIcon } from '../TypeIcon'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'

/** A birth or a death, said in a sentence. Its year is edited on the entry. */
export function FactBody({
  item,
  fact,
  universe,
}: {
  item: TimelineItem
  fact: NonNullable<TimelineItem['loreFact']>
  universe: WorkspaceContext['universe']
}) {
  const { tx } = useI18n()
  const accent = fact.entityTypeAccentColor
    ? ({ '--type-accent': fact.entityTypeAccentColor } as CSSProperties)
    : undefined
  return (
    <>
      <h3 className="moment__title">
        {tx(fact.fact === FieldSemantic.DeathYear ? 'time.timeline.dies' : 'time.timeline.born', {
          title: <bdi>{item.title}</bdi>,
        })}
      </h3>
      <p className="moment__context" style={accent}>
        <TypeIcon iconKey={fact.entityTypeIcon} className="lorechip__icon" />{' '}
        <bdi>{fact.entityTypeName}</bdi>
      </p>
      <p className="moment__links">
        <Link
          to={`/app/universes/${universe.id}/lore/${fact.entityId}`}
          aria-label={t('time.timeline.openEntryLabel', { title: item.title })}
          data-testid="timeline-open-lore"
        >
          {t('time.timeline.openEntry')}
        </Link>
      </p>
    </>
  )
}
