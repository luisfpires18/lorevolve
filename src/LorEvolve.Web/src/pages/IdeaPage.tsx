import { useParams } from 'react-router-dom'
import { IdeaEditor } from '../components/IdeaEditor'
import type { RecordListNotice } from '../components/ideas/RecordListPage'
import { useRecordPlace } from '../ideas/useRecordPlace'

interface IdeaPageProps {
  inUniverse?: boolean
  isNew?: boolean
}

/**
 * One idea, new or saved, globally at `/app/ideas/...` or inside a universe's workspace. A new idea started inside a
 * universe starts in that universe; its author may take it out again before saving.
 */
export default function IdeaPage({ inUniverse = false, isNew = false }: IdeaPageProps) {
  const { navigate, listPath, place } = useRecordPlace(inUniverse, 'ideas')
  const { ideaId } = useParams<{ ideaId: string }>()

  return (
    <IdeaEditor
      // A different idea - or the new one becoming saved - is a different editor, starting from nothing.
      key={isNew ? 'new' : ideaId}
      ideaId={isNew ? null : (ideaId ?? null)}
      {...place}
      // Creating is finished once it is created: back to the universe's list it was started from. Replacing the finished form
      // in history, so Back never returns to it; the list says what was created.
      onCreated={(idea) =>
        void navigate(listPath, {
          replace: true,
          state: { created: { id: idea.id, title: idea.title } } satisfies RecordListNotice,
        })
      }
    />
  )
}
