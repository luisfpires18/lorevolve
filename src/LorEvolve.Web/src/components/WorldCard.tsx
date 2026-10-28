import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from './BrandMark'
import { authorPath, worldPath, type PublicUniverse } from '../portal/api'
import { categoryLabel, genreKey, genreLabel } from '../publishing/types'

/**
 * One public universe as a card: one dark panel with the artwork across its top, fading into the panel, the name set over
 * the picture's lower edge, the genres as chips, and a line with the author and the category. The picture is the
 * author's 16:10 frame, whole - the panel grows around it rather than cropping it. If it cannot be shown, the card keeps
 * its shape with the LorEvolve mark rather than borrowing anyone's art.
 *
 * A world based on someone else's work (ADR 0039) names that work's creator on a line of its own above the byline - plain
 * text, never a link - and its LorEvolve author as "curated by". The full attribution is on the world's page.
 *
 * Two links and no nesting (Task 011): the world's name is the card's link, stretched over the whole panel so the card
 * is still one target, and the author's name - on Explore - is a second link laid above it, to their author page. On an
 * author's own page the name is plain text: it would only link to where the reader already is.
 */
export function WorldCard({
  world,
  linkAuthor = true,
}: {
  world: PublicUniverse
  linkAuthor?: boolean
}) {
  const [broken, setBroken] = useState(false)

  return (
    <li className="worldcard">
      <div className="worldcard__panel">
        <div className="worldcard__art">
          {broken ? (
            <span className="worldcard__fallback" data-testid="worldcard-fallback">
              <BrandMark className="worldcard__mark" />
            </span>
          ) : (
            <img
              className="worldcard__image"
              src={world.cardImageUrl}
              alt=""
              width={960}
              height={600}
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
            />
          )}
        </div>
        <div className="worldcard__text">
          <h3 className="worldcard__name" dir="auto" title={world.name}>
            <Link className="worldcard__link" to={worldPath(world.slug)}>
              <bdi>{world.name}</bdi>
            </Link>
          </h3>
          <ul className="worldcard__genres" aria-label="Genres">
            {world.genres.map((genre) => (
              <li className="genrechip" data-genre={genreKey(genre)} key={genre}>
                {genreLabel(genre)}
              </li>
            ))}
          </ul>
          {world.originalCreator ? (
            <p
              className="worldcard__original"
              dir="auto"
              title={`Based on works by ${world.originalCreator}`}
              data-testid="worldcard-original"
            >
              Based on works by <bdi>{world.originalCreator}</bdi>
            </p>
          ) : null}
          <p className="worldcard__byline">
            <span
              className="worldcard__author"
              dir="auto"
              title={`${world.originalCreator ? 'curated by' : 'by'} ${world.authorDisplayName}`}
            >
              {world.originalCreator ? 'curated by' : 'by'}{' '}
              {linkAuthor ? (
                <Link
                  className="worldcard__authorlink"
                  to={authorPath(world.authorSlug)}
                  data-testid="worldcard-author"
                >
                  <bdi>{world.authorDisplayName}</bdi>
                </Link>
              ) : (
                <bdi>{world.authorDisplayName}</bdi>
              )}
            </span>
            <span className="worldcard__category">{categoryLabel(world.category)}</span>
          </p>
        </div>
      </div>
    </li>
  )
}
