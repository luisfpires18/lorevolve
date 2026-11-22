import { useNavigate, useOutletContext } from 'react-router-dom'
import { Quoted } from '../components/NameList'
import type { RecordListNotice } from '../components/ideas/RecordListPage'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'

/**
 * Where an idea's or a board's page is: inside a universe's workspace (`inUniverse` with an outlet context) or the
 * account's. Gives the page `navigate`, the `universe`, the list's path, and `place`, the editor props that follow
 * from them (its default and context universe, the way back, and back to the list once deleted). Each page keeps its
 * own `onCreated`.
 */
export function useRecordPlace(inUniverse: boolean, kind: 'ideas' | 'boards') {
  const { t, tx } = useI18n()
  const navigate = useNavigate()
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  const ideasPath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'
  const listPath = kind === 'boards' ? `${ideasPath}/boards` : ideasPath
  const listLabel = universe
    ? tx(kind === 'boards' ? 'ideas.pages.boardsIn' : 'ideas.pages.ideasIn', {
        universe: <Quoted text={universe.name} />,
      })
    : t(kind === 'boards' ? 'ideas.pages.allBoards' : 'ideas.pages.allIdeas')

  return {
    navigate,
    universe,
    listPath,
    place: {
      defaultUniverseId: universe?.id ?? null,
      contextUniverse: universe ? { id: universe.id, name: universe.name } : null,
      listPath,
      listLabel,
      onDeleted: (record: { id: string; title: string }) =>
        void navigate(listPath, { state: { deleted: record } satisfies RecordListNotice }),
    },
  }
}
