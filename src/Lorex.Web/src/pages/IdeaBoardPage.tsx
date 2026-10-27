import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { BoardsListNotice } from '../components/IdeaBoardsBrowser'
import { IdeaBoardEditor } from '../components/IdeaBoardEditor'
import { Quoted } from '../components/NameList'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * One idea board, new or saved, globally at `/app/ideas/boards/...` or inside a universe's workspace. A board started
 * inside a universe starts in it.
 */
export default function IdeaBoardPage({
  inUniverse = false,
  isNew = false,
}: {
  inUniverse?: boolean
  isNew?: boolean
}) {
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  const listPath = universe ? `/app/universes/${universe.id}/ideas/boards` : '/app/ideas/boards'

  return (
    <IdeaBoardEditor
      key={isNew ? 'new' : boardId}
      boardId={isNew ? null : (boardId ?? null)}
      defaultUniverseId={universe?.id ?? null}
      contextUniverse={universe ? { id: universe.id, name: universe.name } : null}
      listPath={listPath}
      listLabel={
        universe ? (
          <>
            Boards in <Quoted text={universe.name} />
          </>
        ) : (
          'All boards'
        )
      }
      // A created board opens where it now lives, replacing the new form in history.
      onCreated={(board) =>
        void navigate(
          universe && board.universe?.id === universe.id
            ? `${listPath}/${board.id}`
            : `/app/ideas/boards/${board.id}`,
          { replace: true },
        )
      }
      onDeleted={(board) =>
        void navigate(listPath, { state: { deleted: board } satisfies BoardsListNotice })
      }
    />
  )
}
