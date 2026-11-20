import type { ComponentProps, ReactNode } from 'react'
import type { Load } from '../lib/useAsyncRead'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'

/**
 * One read drawn by its state: `loading` is a LoadingNote, `error` a LoadError (its message is the read's own unless
 * `error.message` is given), `missing` the `missing` node (nothing when left out) and `ready` the children. Use for
 * every screen that reads through `useAsyncRead`; reads that keep old content during a reload are not gated yet.
 */
export function ReadGate<T>({
  load,
  loading,
  error,
  missing = null,
  children,
}: {
  load: Load<T>
  loading: { text: ReactNode; testId?: string; className?: string }
  error: Omit<ComponentProps<typeof LoadError>, 'message'> & { message?: ReactNode }
  missing?: ReactNode
  children: (value: T) => ReactNode
}) {
  switch (load.kind) {
    case 'loading':
      return (
        <LoadingNote testId={loading.testId} className={loading.className}>
          {loading.text}
        </LoadingNote>
      )
    case 'error':
      return <LoadError {...error} message={error.message ?? load.message} />
    case 'missing':
      return <>{missing}</>
    case 'ready':
      return <>{children(load.value)}</>
  }
}
