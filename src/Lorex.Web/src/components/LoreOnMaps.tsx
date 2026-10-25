import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listEntityMapPins, mapPath, mapsPath } from '../maps/api'
import type { EntityMapPin } from '../maps/types'

type LoadState = { kind: 'loading' } | { kind: 'ready'; pins: EntityMapPin[] } | { kind: 'error' }

/**
 * Where an entry is on the maps (issue #52): one link per map it is pinned on, each opening that map on its pin. An entry
 * pinned on several maps lists them all, by map name, so the way to a map is never guessed. Read once per entry; a failed
 * read says so quietly rather than pretending the entry is nowhere.
 */
export function LoreOnMaps({
  universeId,
  entityId,
  canEdit,
}: {
  universeId: string
  entityId: string
  canEdit: boolean
}) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    listEntityMapPins(universeId, entityId, controller.signal)
      .then((pins) => setState({ kind: 'ready', pins }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      })
    return () => controller.abort()
  }, [universeId, entityId])

  return (
    <div className="rail__block" data-testid="entry-maps">
      <h2 className="rail__heading">Maps</h2>
      {state.kind === 'loading' ? <p className="rail__quiet">Looking…</p> : null}
      {state.kind === 'error' ? <p className="rail__quiet">The maps could not be read.</p> : null}
      {state.kind === 'ready' && state.pins.length === 0 ? (
        <p className="rail__quiet" data-testid="entry-maps-none">
          Not placed on a map.{' '}
          {canEdit ? (
            <Link to={mapsPath(universeId)} data-testid="entry-maps-go">
              Open the maps
            </Link>
          ) : null}
        </p>
      ) : null}
      {state.kind === 'ready' && state.pins.length > 0 ? (
        <ul className="entrymaps" data-testid="entry-maps-list">
          {state.pins.map((pin) => (
            <li key={pin.pinId}>
              <Link
                className="entrymaps__link"
                to={mapPath(universeId, pin.mapId, pin.pinId)}
                data-testid="entry-map-link"
                data-map-name={pin.mapName}
              >
                <MapPin
                  className="entrymaps__icon"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                />
                <span>
                  On <bdi>{pin.mapName}</bdi>
                  {pin.title !== '' ? (
                    <span className="entrymaps__pin"> as “{pin.title}”</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
