import type { ReactNode } from 'react'
import { BookOpen, Gamepad2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { StatusBadge } from './StatusBadge'

/**
 * One thing an author is making, on its shelf: a game in a handheld console, its cover on the screen; a story as a
 * book, its cover on the front. Gaming and Writing draw the same card from different sources (owner, 2026-11-17), so
 * the two pages mirror each other: the frame changes, the parts do not.
 *
 * The whole card is one link (the title's, stretched); the ⋯ menu sits above it so it stays its own control. Every
 * drawn part of the frame (bezel, LED, buttons, spine, page edges) is decoration and hidden from assistive technology.
 */
export function ShelfCard({
  frame,
  href,
  title,
  description,
  step,
  statusLabel,
  meta,
  cover,
  menu,
  attrs,
  openTestId,
}: {
  frame: 'console' | 'book'
  href: string
  title: string
  description: string | null
  /** 0, 1 or 2: Planning, under way, Complete. Both status enums share these values. */
  step: 0 | 1 | 2
  statusLabel: string
  meta?: ReactNode
  /** The card crop's address, or null for the frame's own empty screen or plain cover. */
  cover: string | null
  menu?: ReactNode
  /** The item's own test ids and data attributes, which each page already selects its rows by. */
  attrs: Record<string, string>
  openTestId?: string
}) {
  const heading = (
    <h3 className="shelfcard__title">
      <Link className="shelfcard__link" to={href} data-testid={openTestId}>
        <bdi>{title}</bdi>
      </Link>
    </h3>
  )
  const text = (
    <div className="shelfcard__text">
      <div className="shelfcard__status">
        <StatusBadge step={step} label={statusLabel} />
        {meta ? <span className="shelfcard__meta">{meta}</span> : null}
      </div>
      {description ? <p className="shelfcard__description">{description}</p> : null}
    </div>
  )

  return (
    <li className={`shelfcard shelfcard--${frame}`} {...attrs}>
      {frame === 'console' ? (
        <div className="console">
          <div className="console__bezel">
            <span className="console__led" aria-hidden="true" />
            <div className="console__screen">
              {cover ? (
                <img src={cover} alt="" width={960} height={600} loading="lazy" decoding="async" />
              ) : (
                <Gamepad2 className="console__empty" aria-hidden="true" strokeWidth={1.25} />
              )}
            </div>
          </div>
          {heading}
          {text}
          <div className="console__controls" aria-hidden="true">
            <span className="console__dpad" />
            <span className="console__ab">
              <span />
              <span />
            </span>
          </div>
        </div>
      ) : (
        <>
          <div className="book">
            <div className="book__cover">
              {cover ? (
                <img src={cover} alt="" width={400} height={600} loading="lazy" decoding="async" />
              ) : (
                <BookOpen className="book__empty" aria-hidden="true" strokeWidth={1.25} />
              )}
            </div>
          </div>
          {heading}
          {text}
        </>
      )}
      {menu ? <div className="shelfcard__menu">{menu}</div> : null}
    </li>
  )
}

/** A project's stage as the card's status step: Archived reads as Complete, the furthest a project went. */
export function shelfStep(lifecycle: 0 | 1 | 2 | 3): 0 | 1 | 2 {
  return lifecycle === 3 ? 2 : lifecycle
}
