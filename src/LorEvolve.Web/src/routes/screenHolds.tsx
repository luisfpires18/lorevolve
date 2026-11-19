import { Suspense, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { LoadingNote } from '../components/LoadingNote'

/**
 * Held while a whole screen's code is fetched. The same plate the session probe holds behind
 * (`SessionPending`): the paper the app is about to draw on, so nothing flashes and nothing moves.
 */
function ScreenPending() {
  const { t } = useI18n()
  return <div className="session-pending" role="status" aria-label={t('shell.app.screenPending')} />
}

/** The same hold inside a frame that stays put around it: a universe's rail, sidebar and search, or the workspace bar. */
function SectionPending() {
  const { t } = useI18n()
  return <LoadingNote>{t('shell.app.sectionPending')}</LoadingNote>
}

/**
 * A screen behind its own boundary, keyed by which screen it is.
 *
 * The key is what makes leaving honest. Without one, React reconciles the outgoing screen against
 * the incoming one, and while the incoming code is still being fetched it holds the outgoing screen
 * on the page - past the moment the address changed, and past the moment an author answered "yes,
 * leave" to an editor's unsaved-changes question. An editor that is still mounted is still guarding,
 * so the browser would ask a second time about a departure already agreed to (`useLeaveGuard`).
 * A changed key unmounts the screen being left in the same commit, exactly as a direct import did.
 *
 * Screens that are one component over several addresses share one key, so they keep their state as
 * they always have: an entry across entries, a story across its scenes, plot and manuscript.
 */
function screen(key: string, hold: ReactNode, page: ReactNode) {
  return (
    <Suspense key={key} fallback={hold}>
      {page}
    </Suspense>
  )
}

export const asScreen = (key: string, page: ReactNode) => screen(key, <ScreenPending />, page)

export const asSection = (key: string, page: ReactNode) => screen(key, <SectionPending />, page)
