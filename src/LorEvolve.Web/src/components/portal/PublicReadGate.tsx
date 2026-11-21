import type { ReactNode } from 'react'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { PortalError, PortalMissing } from '../PortalMissing'

/** Each public page's placeholder while it opens: its frame, then the bone inside it. */
const SKELETONS = {
  hero: ['pworld', 'pworld-hero pskeleton pskeleton--hero'],
  author: ['pauthor', 'pauthor__head pskeleton pskeleton--author'],
  page: ['pread', 'pskeleton pskeleton--page'],
} as const

/**
 * A public page's one read: its skeleton while it opens, the shared missing page for a 404 (private, trashed and never
 * there read the same, ADR 0036), the shared error page with Try again for any other failure, then `children` with
 * what was read. `read` must be stable for `readKey` (memoize it on the address it reads).
 */
export function PublicReadGate<T>({
  readKey,
  read,
  missing,
  skeleton,
  opening,
  children,
}: {
  readKey: string
  read: (signal: AbortSignal) => Promise<T>
  missing: { title: string; testId: string }
  skeleton: keyof typeof SKELETONS
  /** The skeleton's accessible name. */
  opening: string
  children: (value: T) => ReactNode
}) {
  const { load, retry } = useAsyncRead(read, { key: readKey, missing: true })

  if (load.kind === 'missing')
    return <PortalMissing title={missing.title} testId={missing.testId} />
  if (load.kind === 'error') return <PortalError onRetry={retry} />
  if (load.kind === 'loading') {
    const [frame, bone] = SKELETONS[skeleton]
    return (
      <div className={frame} role="status" aria-label={opening}>
        <div className={bone} />
      </div>
    )
  }
  return children(load.value)
}
