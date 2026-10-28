import { entityImageUrl } from '../lore/images'
import type { EntityImageRef } from '../lore/types'
import { TypeIcon } from './TypeIcon'

/**
 * An entry's square: its thumbnail, or - with no picture - its type's icon on a tint of the type's
 * accent. The icon is the one the author chose for the type on the Types screen, or the neutral
 * fallback; nothing is inferred from a name.
 *
 * Always decorative (`alt=""`, `aria-hidden` on the blank tile): it sits beside the entry's name,
 * which is what is read. The square is CSS, not the image, so a grid keeps its shape before a byte
 * has loaded. The thumbnail is the author's own square crop; the full picture lives on the entry.
 */
export function EntityTile({
  universeId,
  entityId,
  image,
  typeIcon,
  typeAccent,
  className,
}: {
  universeId: string
  entityId: string
  image: EntityImageRef | null
  typeIcon: string | null
  typeAccent: string | null
  className?: string
}) {
  const classes = ['tile', className].filter(Boolean).join(' ')
  const accent = typeAccent ? { ['--type-accent' as string]: typeAccent } : undefined

  if (!image) {
    return (
      <span
        className={`${classes} tile--blank`}
        style={accent}
        aria-hidden="true"
        data-testid="entity-portrait-blank"
      >
        <TypeIcon iconKey={typeIcon} className="tile__icon" />
      </span>
    )
  }

  return (
    <img
      className={classes}
      src={entityImageUrl(universeId, entityId, image, 'thumbnail')}
      alt=""
      loading="lazy"
      decoding="async"
      width={320}
      height={320}
      data-testid="entity-portrait"
    />
  )
}
