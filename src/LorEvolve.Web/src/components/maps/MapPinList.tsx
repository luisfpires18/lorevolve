import { MapPin as MapPinIcon } from 'lucide-react'
import type { MapDetail } from '../../maps/types'
import { useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'
import { SectionTitle } from '../Section'

export function MapPinList({
  map,
  canEdit,
  selectedPinId,
  select,
}: {
  map: MapDetail
  canEdit: boolean
  selectedPinId: string | null
  select: (pinId: string | null, focus?: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <>
      <SectionTitle level={2} tone="label">
        {t('places.mapPage.pins')}{' '}
        {map.pins.length > 0 ? <span className="mapscreen__count">({map.pins.length})</span> : null}
      </SectionTitle>
      {map.pins.length === 0 ? (
        <QuietNote className="mapscreen__empty" testId="map-pins-empty">
          {canEdit ? t('places.mapPage.noPinsEditor') : t('places.mapPage.noPins')}
        </QuietNote>
      ) : (
        <ul className="pinlist" data-testid="map-pin-list">
          {map.pins.map((pin) => (
            <li key={pin.id}>
              <button
                className="pinlist__item"
                type="button"
                aria-pressed={pin.id === selectedPinId}
                onClick={() => select(pin.id, true)}
                data-testid="map-pin-row"
                data-pin-title={pin.title}
              >
                <MapPinIcon
                  className="pinlist__icon"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                />
                <span className="pinlist__text">
                  <bdi>{pin.title}</bdi>
                  {pin.lore?.name ? (
                    <span className="pinlist__lore">
                      {' '}
                      {t('places.mapPage.listType', { type: pin.lore.typeName ?? '' })}
                    </span>
                  ) : null}
                  {!pin.placedOnCurrentImage ? (
                    <span className="pinlist__review"> {t('places.mapPage.awaitingReview')}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
