import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../BrandMark'
import { MAIN_CONTENT_ID } from '../SkipLink'
import { Wordmark } from '../Wordmark'
import { useI18n } from '../../i18n'

/**
 * The consent screen's own frame (issue 38): one card, centred, with the brand kept small. It is a decision, not a
 * landing page, so it does not take the sign-in plate's artwork - the request and its two buttons are the page. A card
 * taller than the screen grows down and scrolls with the page; nothing inside it scrolls on its own.
 */
export function ConsentLayout({
  heading,
  intro,
  footer,
  children,
}: {
  heading: string
  intro: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const { t } = useI18n()

  return (
    <div className="consent-page">
      <main className="consent-card" id={MAIN_CONTENT_ID} tabIndex={-1} data-testid="consent-card">
        <Link
          className="consent-card__brand"
          to="/"
          aria-label={t('shell.brand.homeLabel')}
          data-testid="auth-brand"
        >
          <BrandMark />
          <Wordmark />
        </Link>
        <h1 className="auth__heading consent-card__heading" data-testid="auth-heading">
          {heading}
        </h1>
        <p className="consent-card__intro" data-testid="consent-summary">
          {intro}
        </p>
        {children}
        {footer ? <p className="consent-card__footer">{footer}</p> : null}
      </main>
    </div>
  )
}
