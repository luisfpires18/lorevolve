import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useUniverseAccess, type UniverseCapabilities } from '../universes/access'
import { EmptyState } from './EmptyState'

/**
 * A screen only some roles are offered - Settings, Publish, the Trash, writing a new entry - reached anyway, by a typed or
 * remembered address. Rather than a form that would only fail on submit, an honest page saying it is not available,
 * and the way back. Presentation only: the API refuses the request regardless (ADR 0041).
 */
export function RoleGate({
  need,
  children,
}: {
  /** Absent: every member. Given on a sibling route so routes sharing a screen keep one element type, and its state. */
  need?: keyof UniverseCapabilities
  children: ReactNode
}) {
  const access = useUniverseAccess()
  const { id } = useParams<{ id: string }>()

  if (!need || access[need]) return children

  return (
    <EmptyState
      testId="role-unavailable"
      title="This part of the universe is not available to you."
      hint={
        <>
          Your role in this shared universe does not include it.{' '}
          <Link to={`/app/universes/${id ?? ''}`}>Back to the overview</Link>
        </>
      }
    />
  )
}
