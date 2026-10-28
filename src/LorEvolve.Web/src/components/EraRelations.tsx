import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listEntityRelationships } from '../relationships/api'
import { Validity, type RelationshipView } from '../relationships/types'

/**
 * The relations of one entry that hold in one of its eras (Issues #18, #44), as the relationships list reads them for that era:
 * timeless links and links whose periods name the era or share a moment with its dates. Links whose periods cannot be placed
 * against the era - an era with no dates, a date the reckoning cannot compare - are listed apart, never guessed in or out.
 * Each related entry opens its own page.
 */
export function EraRelations({
  universeId,
  entityId,
  eraId,
}: {
  universeId: string
  entityId: string
  eraId: string
}) {
  const [read, setRead] = useState<{ eraId: string; views: RelationshipView[] | 'failed' } | null>(
    null,
  )

  useEffect(() => {
    const controller = new AbortController()
    listEntityRelationships(universeId, entityId, controller.signal, { eraId })
      .then((views) => setRead({ eraId, views }))
      .catch(() => {
        if (!controller.signal.aborted) setRead({ eraId, views: 'failed' })
      })
    return () => controller.abort()
  }, [universeId, entityId, eraId])

  const views = read?.eraId === eraId ? read.views : null

  if (views === null) {
    return (
      <p className="muted" role="status">
        Reading the relations in this stage…
      </p>
    )
  }

  if (views === 'failed') {
    return (
      <p className="form__message" role="alert">
        The relations in this stage could not be read.
      </p>
    )
  }

  const holding = views.filter((view) => view.validity !== Validity.Unplaced)
  const unplaced = views.filter((view) => view.validity === Validity.Unplaced)

  if (views.length === 0) return null

  return (
    <div className="rail__block" data-testid="era-relations">
      <h4 className="rail__heading">Relations in this stage</h4>
      {holding.length > 0 ? (
        <RelationRows universeId={universeId} views={holding} testId="era-relations-holding" />
      ) : null}
      {unplaced.length > 0 ? (
        // Kept apart and folded: these are not said to hold now, only that their dates can't be set against this era's.
        <details className="erarelations__unplaced" data-testid="era-relations-unplaced-group">
          <summary className="field__hint">
            {unplaced.length === 1
              ? '1 relation can’t be placed in this stage'
              : `${unplaced.length} relations can’t be placed in this stage`}
          </summary>
          <RelationRows universeId={universeId} views={unplaced} testId="era-relations-unplaced" />
        </details>
      ) : null}
    </div>
  )
}

function RelationRows({
  universeId,
  views,
  testId,
}: {
  universeId: string
  views: RelationshipView[]
  testId: string
}) {
  return (
    <ul className="eracovers" data-testid={testId}>
      {views.map((view) => (
        <li key={view.id} data-testid={`era-relation-${view.relatedEntityName}`}>
          <span className="muted">
            <bdi>{view.label}</bdi>{' '}
          </span>
          <Link to={`/app/universes/${universeId}/lore/${view.relatedEntityId}`}>
            <bdi>{view.relatedEntityName}</bdi>
          </Link>
          {view.validity === Validity.Timeless ? <span className="erasource"> Always</span> : null}
        </li>
      ))}
    </ul>
  )
}
