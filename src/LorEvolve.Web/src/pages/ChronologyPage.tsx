import { useOutletContext } from 'react-router-dom'
import { CalendarEditor } from '../components/CalendarEditor'
import { ChronologyEditor } from '../components/ChronologyEditor'
import { ChronologyReading } from '../components/chronology/ChronologyReading'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * A universe's chronology as a workspace section of its own, beside World Rules: the eras its dates are written and
 * ordered in (ADR 0022). Worldbuilding, not configuration - so it left Settings (follow-up to UI refinement 014). The
 * editor, its whole-list save, its preview, its refusals and its leave guard are exactly what they were; only where it
 * lives changed.
 *
 * A collaborator who reads but does not edit (ADR 0041 amendment) is shown the periods as a list, not a form.
 */
export default function ChronologyPage() {
  const { universe, chronology, setChronology } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()

  return (
    <article className="chronologypage" data-testid="chronology-page">
      {access.editContent ? (
        <>
          <ChronologyEditor
            universeId={universe.id}
            chronology={chronology}
            onSaved={setChronology}
          />
          <CalendarEditor
            universeId={universe.id}
            chronology={chronology}
            onSaved={setChronology}
          />
        </>
      ) : (
        <ChronologyReading chronology={chronology} />
      )}
    </article>
  )
}
