import type { PublicUniverse } from '../../portal/api'
import { WorldCard, WorldCardSkeleton } from '../WorldCard'

/**
 * The grid of public world cards (Explore, an author's page). Without `worlds` it draws `skeleton` placeholder cards,
 * hidden from assistive tech; with them, one WorldCard each, the first `eager` fetching their picture at once.
 */
export function WorldGrid({
  worlds,
  skeleton = 0,
  eager = 0,
  linkAuthor,
  testId,
}: {
  worlds?: PublicUniverse[]
  skeleton?: number
  eager?: number
  linkAuthor?: boolean
  testId: string
}) {
  if (!worlds) {
    return (
      <ul className="explore-grid" aria-hidden="true" data-testid={testId}>
        {Array.from({ length: skeleton }, (_, index) => (
          <WorldCardSkeleton key={index} />
        ))}
      </ul>
    )
  }
  return (
    <ul className="explore-grid" data-testid={testId}>
      {worlds.map((world, index) => (
        <WorldCard key={world.slug} world={world} eager={index < eager} linkAuthor={linkAuthor} />
      ))}
    </ul>
  )
}
