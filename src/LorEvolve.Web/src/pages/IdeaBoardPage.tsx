import { useParams } from 'react-router-dom'
import { IdeaBoardEditor } from '../components/IdeaBoardEditor'
import { useRecordPlace } from '../ideas/useRecordPlace'

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
  const { navigate, universe, listPath, place } = useRecordPlace(inUniverse, 'boards')
  const { boardId } = useParams<{ boardId: string }>()

  return (
    <IdeaBoardEditor
      key={isNew ? 'new' : boardId}
      boardId={isNew ? null : (boardId ?? null)}
      {...place}
      // A created board opens where it now lives, replacing the new form in history.
      onCreated={(board) =>
        void navigate(
          universe && board.universe?.id === universe.id ? `${listPath}/${board.id}` : listPath,
          { replace: true },
        )
      }
    />
  )
}
