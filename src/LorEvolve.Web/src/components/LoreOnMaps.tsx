import { useCallback } from 'react'
import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { listEntityMapPins, mapPath } from '../maps/api'
import { useAsyncRead } from '../lib/useAsyncRead'
import { SectionTitle } from './Section'

/**
 * Where an entry is on the maps (issue #52): one link per map it is pinned on, each opening that map on its pin. An entry
 * pinned on several maps lists them all, by map name, so the way to a map is never guessed. Shown only for an entry that
 * is on a map: most entries - people, ideas, objects - never are, and a Maps block on each of them said nothing. Read once
 * per entry; while reading, after a failed read and with no pin, nothing is drawn.
 */
export function LoreOnMaps({ universeId, entityId }: { universeId: string; entityId: string }) {
  const { t, tx } = useI18n()
  const read = useCallback(
    (signal: AbortSignal) => listEntityMapPins(universeId, entityId, signal),
    [universeId, entityId],
  )
  const { load: state } = useAsyncRead(read)

  if (state.kind !== 'ready' || state.value.length === 0) return null

  return (
    <div className="stack stack--2" data-testid="entry-maps">
      <SectionTitle level={2} tone="label">
        {t('lore.onMaps.heading')}
      </SectionTitle>
      <ul className="plainlist stack stack--2" data-testid="entry-maps-list">
        {state.value.map((pin) => (
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
                {tx('lore.onMaps.on', { map: <bdi>{pin.mapName}</bdi> })}
                {pin.title !== '' ? (
                  <span className="entrymaps__pin">
                    {' '}
                    {t('lore.onMaps.asPin', { title: pin.title })}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
