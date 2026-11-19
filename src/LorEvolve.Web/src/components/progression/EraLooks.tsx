import { useI18n } from '../../i18n'
import type { EntityDetail } from '../../lore/types'
import { appearanceDisplayUrl } from '../../progression/api'
import type { Appearance } from '../../progression/types'
import { SectionTitle } from '../Section'

/** The looks worn in this era, each with its first picture. */
export function EraLooks({
  universeId,
  entry,
  looks,
}: {
  universeId: string
  entry: EntityDetail
  looks: Appearance[]
}) {
  const { t } = useI18n()
  return (
    <div className="rail__block">
      <SectionTitle level={4} tone="label">
        {t('progression.era.appearances')}
      </SectionTitle>
      <ul className="eralooks" data-testid="era-appearances">
        {looks.map((look) => (
          <li
            className="eralooks__item"
            key={look.id}
            data-testid={`era-appearances-${look.label}`}
          >
            {look.images[0] ? (
              <img
                className="gallery__thumb"
                decoding="async"
                src={appearanceDisplayUrl(universeId, entry.id, look.id, look.images[0])}
                alt=""
                width={look.images[0].width}
                height={look.images[0].height}
                loading="lazy"
              />
            ) : null}
            <bdi>{look.label}</bdi>
          </li>
        ))}
      </ul>
    </div>
  )
}
