import { profileImageUrl } from '../profile/api'
import type { ProfileImageRef } from '../profile/types'

/**
 * The account's picture in a circle, or its initial when there is none.
 *
 * One component for every place an avatar appears - the workspace rail, the folded mobile bar, the
 * universes header and the Profile screen - so a photo and a monogram are the same shape, the same
 * size rules and the same fallback everywhere. The size itself comes from the class the caller
 * passes, because a rail wants 2rem and a profile wants 7.5rem and nothing else differs.
 *
 * The square is stored square and only *drawn* round here: `object-fit: cover` on a circle of CSS.
 * Nothing is ever cut to a circle, so the same stored avatar could be shown squared off later.
 *
 * Decorative by default. Every caller puts the name either directly beneath it or in the button
 * that wraps it, so a screen reader announcing the picture as well would only say it twice.
 */
export function Avatar({
  image,
  name,
  className = 'avatarcircle',
  testId,
}: {
  image: ProfileImageRef | null
  name: string
  className?: string
  testId?: string
}) {
  if (!image) {
    return (
      <span
        className={`${className} ${className}--blank`}
        aria-hidden="true"
        data-testid={testId}
        data-avatar="monogram"
      >
        {monogram(name)}
      </span>
    )
  }

  return (
    <img
      className={className}
      src={profileImageUrl(image, 'thumbnail')}
      alt=""
      width={320}
      height={320}
      decoding="async"
      data-testid={testId}
      data-avatar="photo"
    />
  )
}

/** The first character the account actually carries, so an emoji or a non-Latin name survives. */
function monogram(name: string) {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}
