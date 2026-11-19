import type { ReactNode } from 'react'
import type { EntityImageRef } from '../lore/types'
import { EntityTile } from './EntityTile'

/**
 * The who-is-this part of a row: the entry's tile, then its name, its kind line and anything under
 * them. A fragment, so the row (`li`, header), its columns and its controls stay the caller's. The
 * name is the caller's node too: a link, a button or a heading, each with its own job.
 */
export function EntityRow({
  universeId,
  entityId,
  image,
  typeIcon,
  typeAccent,
  tileClassName,
  name,
  meta,
  metaTestId,
  children,
}: {
  universeId: string
  entityId: string
  image: EntityImageRef | null
  typeIcon: string | null
  typeAccent: string | null
  /** Changes the tile's shape or size, e.g. the round tile of the family details. */
  tileClassName?: string
  name: ReactNode
  /** The kind line under the name: type, status, spans. */
  meta?: ReactNode
  metaTestId?: string
  children?: ReactNode
}) {
  return (
    <>
      <EntityTile
        className={['entityrow__tile', tileClassName].filter(Boolean).join(' ')}
        universeId={universeId}
        entityId={entityId}
        image={image}
        typeIcon={typeIcon}
        typeAccent={typeAccent}
      />
      <div className="entityrow__body">
        {name}
        {meta !== undefined ? (
          <p className="entityrow__meta" data-testid={metaTestId}>
            {meta}
          </p>
        ) : null}
        {children}
      </div>
    </>
  )
}
