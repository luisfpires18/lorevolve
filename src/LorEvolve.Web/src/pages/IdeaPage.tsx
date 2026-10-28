import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { IdeaEditor } from '../components/IdeaEditor'
import { Quoted } from '../components/NameList'
import type { IdeasListNotice } from '../components/IdeasBrowser'
import type { WorkspaceContext } from './UniverseWorkspace'

interface IdeaPageProps {
  inUniverse?: boolean
  isNew?: boolean
}

/**
 * One idea, new or saved, globally at `/app/ideas/...` or inside a universe's workspace. A new idea started inside a
 * universe starts in that universe; its author may take it out again before saving.
 */
export default function IdeaPage({ inUniverse = false, isNew = false }: IdeaPageProps) {
  const { ideaId } = useParams<{ ideaId: string }>()
  const navigate = useNavigate()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  const listPath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'

  return (
    <IdeaEditor
      // A different idea - or the new one becoming saved - is a different editor, starting from nothing.
      key={isNew ? 'new' : ideaId}
      ideaId={isNew ? null : (ideaId ?? null)}
      defaultUniverseId={universe?.id ?? null}
      contextUniverse={universe ? { id: universe.id, name: universe.name } : null}
      listPath={listPath}
      listLabel={
        universe ? (
          <>
            Ideas in <Quoted text={universe.name} />
          </>
        ) : (
          'All ideas'
        )
      }
      // Creating is finished once it is created: back to the list it was started from - this universe's while the idea is
      // still this universe's, otherwise all ideas, since a universe's Ideas list only its own. Replacing the finished form
      // in history, so Back never returns to it; the list says what was created.
      onCreated={(idea) =>
        void navigate(universe && idea.universe?.id !== universe.id ? '/app/ideas' : listPath, {
          replace: true,
          state: { created: { id: idea.id, title: idea.title } } satisfies IdeasListNotice,
        })
      }
      onDeleted={(idea) =>
        void navigate(listPath, { state: { deleted: idea } satisfies IdeasListNotice })
      }
    />
  )
}
