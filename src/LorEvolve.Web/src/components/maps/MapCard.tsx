import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n'
import { mapImageUrl, mapPath } from '../../maps/api'
import type { MapSummary } from '../../maps/types'
import { QuietNote } from '../QuietNote'

/** One map in a universe's map list: its picture and name open it, with its description and pin count beneath. */
export function MapCard({ universeId, map }: { universeId: string; map: MapSummary }) {
  const { t, tn } = useI18n()
  return (
    <li className="mapcard" data-testid="map-card" data-map-name={map.name}>
      <Link className="mapcard__link" to={mapPath(universeId, map.id)} data-testid="map-open">
        <span className="mapcard__picture">
          <img
            src={mapImageUrl(universeId, map.id, map.image.assetId, 'display')}
            alt=""
            width={map.image.width}
            height={map.image.height}
            loading="lazy"
            decoding="async"
          />
        </span>
        <span className="mapcard__name">
          <bdi>{map.name}</bdi>
        </span>
      </Link>
      {map.description ? (
        <p className="mapcard__description" dir="auto">
          {map.description}
        </p>
      ) : null}
      <QuietNote className="mapcard__meta" testId="map-pin-count">
        {t('places.maps.meta', {
          pins:
            map.pinCount === 0
              ? t('places.maps.noPins')
              : tn('places.maps.pins', map.pinCount, { n: map.pinCount }),
          width: map.image.width,
          height: map.image.height,
        })}
      </QuietNote>
    </li>
  )
}
