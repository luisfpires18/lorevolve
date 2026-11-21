import type { ComponentProps, ReactNode } from 'react'
import type { Load } from '../lib/useAsyncRead'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'

/**
 * One read drawn by its state: `loading` is a LoadingNote (or `loading.skeleton`, for a first read that keeps the
 * shape of what comes, as Lore's cards do), `error` a LoadError (its message is the read's own unless `error.message`
 * is given), `missing` the `missing` node (nothing when left out) and `ready` the children. Use for every screen that
 * reads through `useAsyncRead`, `keep: true` reads included; a notice above a list the page draws itself passes
 * `{() => null}` as its children.
 */
export function ReadGate<T>({
  load,
  loading,
  error,
  missing = null,
  children,
}: {
  load: Load<T>
  loading: { text: ReactNode; testId?: string; className?: string } | { skeleton: ReactNode }
  error: Omit<ComponentProps<typeof LoadError>, 'message'> & { message?: ReactNode }
  missing?: ReactNode
  children: (value: T) => ReactNode
}) {
  switch (load.kind) {
    case 'loading':
      return 'skeleton' in loading ? (
        <>{loading.skeleton}</>
      ) : (
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
