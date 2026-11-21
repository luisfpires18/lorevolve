import type { ReactNode } from 'react'
import { MissingState } from '../components/MissingState'
import { ReadGate } from '../components/ReadGate'
import { t } from '../i18n'
import type { Load } from '../lib/useAsyncRead'
import { useTitleDetail } from '../lib/useTitleDetail'
import type { ProjectDetail } from './types'
import { useGameProject } from './useGameProject'

/**
 * The gate of a Game Entities address (#284, #286, #456): the game is read and checked first, and nothing of a foreign
 * project, or of an entry read through it, is drawn or put in the tab title until it passes. A null game (not a game of
 * this universe, 403 too, G9), a missing universe or `notFound` is the not-found state with its way back; a game that
 * passes is handed to `children` with the universe's id.
 */
export function GameGate({
  projectId,
  universeId,
  notFound = false,
  children,
}: {
  projectId: string | undefined
  universeId: string | undefined
  notFound?: boolean
  children: (game: ProjectDetail, universeId: string) => ReactNode
}) {
  const { loading, failed, retry, game } = useGameProject(projectId, universeId)
  const load: Load<ProjectDetail | null> = loading
    ? { kind: 'loading' }
    : failed
      ? { kind: 'error', message: t('projects.one.failed') }
      : { kind: 'ready', value: game }
  useTitleDetail(game?.name ?? null)

  return (
    <ReadGate
      load={load}
      loading={{ text: t('projects.list.loading') }}
      error={{ onRetry: retry, testId: 'game-project-failed' }}
    >
      {(game) =>
        // Not a game of this universe: the API still decides who may read it, this only keeps the screen honest.
        game === null || !universeId || notFound ? (
          <MissingState
            title={t('projects.gameEntities.notFound')}
            hint={t('projects.gameEntities.notFoundHint')}
            backTo={`/app/universes/${universeId}/game-entities`}
            backLabel={t('projects.gameEntities.back')}
            backTestId="game-entities-back"
            backIn="action"
            testId="game-entities-missing"
          />
        ) : (
          children(game, universeId)
        )
      }
    </ReadGate>
  )
}
