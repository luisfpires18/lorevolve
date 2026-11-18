import type { ReactNode } from 'react'
import {
  BookImage,
  BookOpen,
  Clapperboard,
  Gamepad2,
  ImagePlus,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { t, useI18n } from '../i18n'
import { StatusBadge } from './StatusBadge'
import { Button } from './Button'

/**
 * One thing an author is making, on its shelf: a game on a widescreen handheld, its picture on the screen; a film or
 * series on a strip of film, its picture in the frame; a comic as an issue, its picture on the cover; a story as a book.
 * Every Creation page draws the same card (owner, 2026-11-17), so the pages mirror each other: the object changes, the
 * parts do not. The object carries the picture; the title,
 * status and summary sit under it.
 *
 * The whole card is one link (the title's, stretched); the ⋯ menu and the Add picture button sit above it so each stays
 * its own control. Every drawn part of the object (shell, sticks, buttons, sprockets, masthead, spine, page edges) is
 * decoration and hidden from assistive technology.
 */
export type ShelfFrame = 'console' | 'film' | 'comic' | 'book'

/** The object's own mark on an empty screen, frame or cover. */
const EMPTY_ICON: Record<ShelfFrame, LucideIcon> = {
  console: Gamepad2,
  film: Clapperboard,
  comic: BookImage,
  book: BookOpen,
}

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
  onAddPicture,
  attrs,
  openTestId,
}: {
  frame: ShelfFrame
  href: string
  title: string
  description: string | null
  /** 0, 1 or 2: Planning, under way, Complete. Both status enums share these values. */
  step: 0 | 1 | 2
  statusLabel: string
  meta?: ReactNode
  /** The card crop's address, or null for the object's own empty screen or plain cover. */
  cover: string | null
  menu?: ReactNode
  /** Offered only to those who may edit, and only while there is no picture: it opens the picture drawer. */
  onAddPicture?: () => void
  /** The item's own test ids and data attributes, which each page already selects its rows by. */
  attrs: Record<string, string>
  openTestId?: string
}) {
  useI18n()
  const EmptyIcon = EMPTY_ICON[frame]
  const picture = cover ? (
    <img src={cover} alt="" loading="lazy" decoding="async" />
  ) : (
    <div className="shelfcard__empty">
      <EmptyIcon className="shelfcard__emptyicon" aria-hidden="true" strokeWidth={1.25} />
      {onAddPicture ? (
        <Button
          tone="secondary"
          size="sm"
          icon={ImagePlus}
          className="shelfcard__add"
          onClick={onAddPicture}
          data-testid="shelf-add-picture"
        >
          {t('projects.common.addPicture')}
        </Button>
      ) : null}
    </div>
  )

  return (
    <li className={`shelfcard shelfcard--${frame}`} {...attrs}>
      {frame === 'console' ? (
        <div className="handheld">
          <span className="handheld__grip" aria-hidden="true">
            <span className="handheld__stick" />
            <span className="handheld__dpad" />
          </span>
          <div className="handheld__screen">{picture}</div>
          <span className="handheld__grip" aria-hidden="true">
            <span className="handheld__face">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="handheld__stick" />
          </span>
        </div>
      ) : frame === 'film' ? (
        <div className="filmstrip">
          <div className="filmstrip__frame">{picture}</div>
        </div>
      ) : frame === 'comic' ? (
        <div className="comic">
          <div className="comic__cover">{picture}</div>
        </div>
      ) : (
        <div className="book">
          <div className="book__cover">{picture}</div>
        </div>
      )}
      <h3 className="shelfcard__title">
        <Link className="shelfcard__link" to={href} data-testid={openTestId}>
          <bdi>{title}</bdi>
        </Link>
      </h3>
      <div className="shelfcard__text">
        <div className="shelfcard__status">
          <StatusBadge step={step} label={statusLabel} />
          {meta ? <span className="shelfcard__meta">{meta}</span> : null}
        </div>
        {description ? <p className="shelfcard__description">{description}</p> : null}
      </div>
      {menu ? <div className="shelfcard__menu">{menu}</div> : null}
    </li>
  )
}

/** A project's stage as the card's status step: Archived reads as Complete, the furthest a project went. */
export function shelfStep(lifecycle: 0 | 1 | 2 | 3): 0 | 1 | 2 {
  return lifecycle === 3 ? 2 : lifecycle
}
