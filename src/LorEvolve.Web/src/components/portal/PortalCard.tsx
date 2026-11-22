import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * One card in a public world's lore or story grid. With `thumb` it is a lore card (the square picture beside its type,
 * name and summary, `plorecard`); without, a story card (title, summary and a call to read, `pstorycard`). The two keep
 * their own class names because the reading specs and the stylesheet address them.
 */
export function PortalCard({
  to,
  kicker,
  thumb,
  title,
  summary,
  cta,
}: {
  to: string
  kicker?: ReactNode
  thumb?: ReactNode
  title: ReactNode
  /** Drawn whenever given, empty or not; leave it out to draw nothing. */
  summary?: ReactNode
  cta?: ReactNode
}) {
  const lore = thumb !== undefined
  const text = (
    <>
      {kicker !== undefined ? <span className="plorecard__type">{kicker}</span> : null}
      <span className={lore ? 'plorecard__name' : 'pstorycard__title'} dir="auto">
        <bdi>{title}</bdi>
      </span>
      {summary !== undefined ? (
        <span className={lore ? 'plorecard__summary' : 'pstorycard__summary'} dir="auto">
          {summary}
        </span>
      ) : null}
      {cta !== undefined ? (
        <span className="pstorycard__cta" aria-hidden="true">
          {cta}
        </span>
      ) : null}
    </>
  )

  return (
    <li className={lore ? 'plorecard' : 'pstorycard'}>
      <Link className={lore ? 'plorecard__link' : 'pstorycard__link'} to={to}>
        {lore ? (
          <>
            <span className="plorecard__thumb" aria-hidden="true">
              {thumb}
            </span>
            <span className="plorecard__text">{text}</span>
          </>
        ) : (
          text
        )}
      </Link>
    </li>
  )
}
