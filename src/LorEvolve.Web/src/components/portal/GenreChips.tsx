import { genreKey, genreLabel } from '../../publishing/types'
import type { PublicUniverse } from '../../portal/api'

/** A world's genres as chips, each coloured by its genre. The list is named for screen readers by `label`. */
export function GenreChips({
  genres,
  label,
  className,
}: {
  genres: PublicUniverse['genres']
  label: string
  /** Extra classes a screen places this by. */
  className?: string
}) {
  return (
    <ul className={['worldcard__genres', className].filter(Boolean).join(' ')} aria-label={label}>
      {genres.map((genre) => (
        <li className="genrechip" data-genre={genreKey(genre)} key={genre}>
          {genreLabel(genre)}
        </li>
      ))}
    </ul>
  )
}
