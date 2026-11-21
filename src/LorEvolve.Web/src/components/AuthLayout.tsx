import type { ReactNode, Ref } from 'react'

import { useI18n } from '../i18n'
import { BrandLink } from './BrandLink'
import { MAIN_CONTENT_ID } from './SkipLink'

interface AuthLayoutProps {
  heading: string
  intro: ReactNode
  children: ReactNode
  footer: ReactNode
  /** Given when the heading changes in place (an invitation's states), so focus can be moved to it; it is then focusable. */
  headingRef?: Ref<HTMLHeadingElement>
  /** `card` is the consent screen's frame; `plate` (the default) every other auth page's. */
  variant?: 'plate' | 'card'
}

/**
 * Two-part canvas: a graphite plate carrying the wordmark, and a paper column
 * carrying the form. The plate becomes a slim band on narrow screens.
 *
 * `variant="card"` is the consent screen's own frame (issue 38): one card, centred, with the brand kept small. It is a
 * decision, not a landing page, so it does not take the plate's artwork - the request and its two buttons are the page.
 * A card taller than the screen grows down and scrolls with the page; nothing inside it scrolls on its own. No footer
 * there draws no footer line.
 */
export function AuthLayout({
  heading,
  intro,
  children,
  footer,
  headingRef,
  variant = 'plate',
}: AuthLayoutProps) {
  const { t } = useI18n()
  if (variant === 'card') {
    return (
      <div className="consent-page">
        <main
          className="consent-card"
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          data-testid="consent-card"
        >
          <BrandLink className="consent-card__brand" testId="auth-brand" />
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
  return (
    <div className="auth">
      <aside className="auth__plate">
        <div className="auth__mark">
          {/* The one place the symbol is shown large. On the plate and unbacked: at this size
              the artwork's dark shading reads as modelling rather than as absence, which it
              does not at the size the workspace rail would draw it. */}
          {/* LorEvolve's brand leads to its home (031). */}
          <BrandLink className="auth__brand" testId="auth-brand" large />
          <span className="auth__rule" aria-hidden="true" />
          <p className="auth__pitch">{t('auth.layout.pitch')}</p>
        </div>
      </aside>

      <main className="auth__panel" id={MAIN_CONTENT_ID} tabIndex={-1}>
        <div className="auth__form">
          <h1
            className="auth__heading"
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            data-testid="auth-heading"
          >
            {heading}
          </h1>
          <p className="auth__intro">{intro}</p>
          {children}
          <p className="auth__footer">{footer}</p>
        </div>
      </main>
    </div>
  )
}
