import { useOutletContext } from 'react-router-dom'
import { IdeaBoardsBrowser } from '../components/IdeaBoardsBrowser'
import type { WorkspaceContext } from './UniverseWorkspace'

/** Idea boards: every board of the account at `/app/ideas/boards`, or one universe's inside its workspace (ADR 0066). */
export default function IdeaBoardsPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  return <IdeaBoardsBrowser universe={universe ? { id: universe.id, name: universe.name } : null} />
}
