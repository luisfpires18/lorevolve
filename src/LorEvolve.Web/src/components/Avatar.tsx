import { monogram } from '../lib/monogram'
import { profileImageUrl } from '../profile/api'
import type { ProfileImageRef } from '../profile/types'
import { PictureWithFallback } from './PictureWithFallback'

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
 * A photo that fails to load shows the monogram instead. The picture is the profile's `image`, or a plain `src`
 * where the photo is a public address (an author's page).
 *
 * Decorative by default. Every caller puts the name either directly beneath it or in the button
 * that wraps it, so a screen reader announcing the picture as well would only say it twice.
 */
export function Avatar({
  image,
  src,
  name,
  className,
  testId,
}: {
  image?: ProfileImageRef | null
  src?: string | null
  name: string
  className: string
  testId?: string
}) {
  const blank = (
    <span
      className={`${className} ${className}--blank`}
      aria-hidden="true"
      data-testid={testId}
      data-avatar="monogram"
    >
      {monogram(name)}
    </span>
  )
  const photo = src ?? (image ? profileImageUrl(image, 'thumbnail') : null)
  if (!photo) return blank

  return (
    <PictureWithFallback
      className={className}
      src={photo}
      alt=""
      width={320}
      height={320}
      decoding="async"
      testId={testId}
      data-avatar="photo"
      fallback={blank}
    />
  )
}
