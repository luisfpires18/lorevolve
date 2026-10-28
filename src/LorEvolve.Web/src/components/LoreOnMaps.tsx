import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { listEntityMapPins, mapPath } from '../maps/api'
import type { EntityMapPin } from '../maps/types'

type LoadState = { kind: 'loading' } | { kind: 'ready'; pins: EntityMapPin[] } | { kind: 'error' }

/**
 * Where an entry is on the maps (issue #52): one link per map it is pinned on, each opening that map on its pin. An entry
 * pinned on several maps lists them all, by map name, so the way to a map is never guessed. Shown only for an entry that
 * is on a map: most entries - people, ideas, objects - never are, and a Maps block on each of them said nothing. Read once
 * per entry; while reading, after a failed read and with no pin, nothing is drawn.
 */
export function LoreOnMaps({ universeId, entityId }: { universeId: string; entityId: string }) {
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

  if (state.kind !== 'ready' || state.pins.length === 0) return null

  return (
    <div className="rail__block" data-testid="entry-maps">
      <h2 className="rail__heading">Maps</h2>
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
    </div>
  )
}
