import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import type { EntityDetail } from '../../lore/types'
import type { Progression } from '../../progression/types'

/**
 * The present-day profile's head (Issue #44): what the entry is, in its own summary, how much of its story is told here - eras,
 * forms, abilities, appearances - and the way back to the article, which stays the entry's one source of truth.
 */
export function Overview({
  universeId,
  entry,
  progression,
}: {
  universeId: string
  entry: EntityDetail
  progression: Progression
}) {
  const { t, tn } = useI18n()
  const counts = [
    [progression.eras.length, 'progression.overview.stages'],
    [progression.forms.length, 'progression.overview.forms'],
    [progression.abilities.length, 'progression.overview.abilities'],
    [progression.appearances.length, 'progression.overview.appearances'],
  ] as const
  const told = counts.filter(([count]) => count > 0).map(([count, key]) => tn(key, count))

  return (
    <div className="stack stack--2" data-testid="progression-overview">
      {entry.summary ? <p className="progoverview__summary prose">{entry.summary}</p> : null}
      <p className="progoverview__meta">
        {told.length > 0 ? <span data-testid="progression-counts">{told.join(' · ')}</span> : null}
        <Link
          to={`/app/universes/${universeId}/lore/${entry.id}`}
          data-testid="progression-article"
        >
          {t('progression.overview.article')}
        </Link>
      </p>
    </div>
  )
}
