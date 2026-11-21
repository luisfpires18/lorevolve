import type { ReactNode } from 'react'
import { Callout } from './Callout'
import { LoadingNote } from './LoadingNote'

/**
 * The region a disclosure row shows and hides, with the detail it reads on open (`useReadOnOpen`): the read error,
 * the loading line while the read is under way, then the caller's content. Hidden, not unmounted, while closed, so
 * `aria-controls` always names it. Catalogue: `docs/design/ui-components.md`.
 */
export function DisclosurePanel({
  id,
  open,
  loaded,
  failed,
  failedText,
  loadingText,
  testId,
  children,
}: {
  id: string
  open: boolean
  /** The detail has arrived. */
  loaded: boolean
  failed: boolean
  failedText: ReactNode
  loadingText: ReactNode
  testId: string
  children?: ReactNode
}) {
  return (
    <div id={id} hidden={!open} data-testid={testId}>
      {failed ? (
        <Callout look="notice" tone="error" as="p" role="alert">
          {failedText}
        </Callout>
      ) : null}

      {open && !loaded && !failed ? <LoadingNote>{loadingText}</LoadingNote> : null}

      {children}
    </div>
  )
}
