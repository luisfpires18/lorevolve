import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { authorPath, type PublicUniverse } from '../portal/api'

/**
 * Who a public world is by (ADR 0039). A world of its author's own: "by" its author. A world based on someone else's work:
 * "Based on works by" the original creator - and the work, when named - then "Curated on LorEvolve by" its author, and a
 * restrained note that it is an unofficial fan or reference project. The original creator is a name and nothing more: it
 * never links anywhere, since no LorEvolve account is theirs. Only the LorEvolve author links, to their author page.
 *
 * `testId` prefixes the author link's test id, as each page named it before (`public-world-author`, `public-story-author`).
 */
export function WorldAttribution({
  world,
  className,
  testId,
  after,
}: {
  world: PublicUniverse
  className: string
  testId: string
  /** Anything that follows the author on the same line, such as a story's publication date. */
  after?: ReactNode
}) {
  const author = (
    <Link className="plink" to={authorPath(world.authorSlug)} data-testid={`${testId}-author`}>
      <bdi>{world.authorDisplayName}</bdi>
    </Link>
  )

  if (!world.originalCreator) {
    return (
      <p className={className} data-testid={`${testId}-byline`}>
        by {author}
        {after}
      </p>
    )
  }

  return (
    <div className={`attribution ${className}`} data-testid={`${testId}-byline`}>
      <p className="attribution__original" data-testid={`${testId}-original`}>
        Based on works by <bdi className="attribution__creator">{world.originalCreator}</bdi>
        {world.originalWork ? (
          <>
            <span aria-hidden="true"> · </span>
            <cite className="attribution__work">
              <bdi>{world.originalWork}</bdi>
            </cite>
          </>
        ) : null}
      </p>
      <p className="attribution__curator">
        Curated on LorEvolve by {author}
        {after}
      </p>
      <p className="attribution__note" data-testid={`${testId}-unofficial`}>
        Unofficial fan or reference project. Not affiliated with or endorsed by the original
        creator.
      </p>
    </div>
  )
}
