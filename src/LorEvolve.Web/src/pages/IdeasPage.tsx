import { useOutletContext } from 'react-router-dom'
import { IdeasBrowser } from '../components/IdeasBrowser'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * Ideas: every idea the account has at `/app/ideas`, or one universe's inside its workspace. One list either way
 * (`IdeasBrowser`) - not two idea systems. A story's ideas are the same list again, inside the story's page.
 */
export default function IdeasPage({ inUniverse = false }: { inUniverse?: boolean }) {
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null

  if (universe) {
    return (
      <IdeasBrowser
        scope={{ kind: 'universe', universe: { id: universe.id, name: universe.name } }}
      />
    )
  }

  return <IdeasBrowser scope={{ kind: 'all' }} />
}
