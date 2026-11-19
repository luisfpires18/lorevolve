import { Announce } from './Announce'
import { CardGrid, type CardGridMin } from './CardGrid'

/**
 * Cards about to arrive: `count` outlines in a hidden grid, said once by `announce`. `tile` is an entry card's shape,
 * which waits 300 ms before it shows so a quick read never flashes it; `icon` is a type card's.
 */
export function CardSkeleton({
  shape,
  count = 6,
  announce,
  min,
  className,
}: {
  shape: 'tile' | 'icon'
  count?: number
  announce?: string
  min?: CardGridMin
  className?: string
}) {
  const cards = Array.from({ length: count }, (_, index) =>
    shape === 'tile' ? (
      <li className="skeletoncard" key={index}>
        <span className="skeleton skeletoncard__tile" />
        <span className="skeletoncard__lines">
          <span className="skeleton skeletoncard__line" />
          <span className="skeleton skeletoncard__line skeletoncard__line--short" />
        </span>
      </li>
    ) : (
      <li className="typecard typecard--skeleton" key={index}>
        <span className="skeleton typecard__icon" />
        <span className="typecard__body">
          <span className="skeleton skeletoncard__line" />
          <span className="skeleton skeletoncard__line skeletoncard__line--short" />
        </span>
      </li>
    ),
  )
  return (
    <>
      {announce ? <Announce>{announce}</Announce> : null}
      <CardGrid
        min={min}
        className={[shape === 'tile' ? 'cardskeleton' : null, className].filter(Boolean).join(' ')}
        aria-hidden="true"
      >
        {cards}
      </CardGrid>
    </>
  )
}
