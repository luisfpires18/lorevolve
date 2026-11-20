import { deleteEpisode, moveEpisode, type ProjectSeason } from '../../projectEntities/seasons'
import { ActionMenu } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { ChapterPages } from '../ChapterPages'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { ProjectStructureWords, WORDS } from '../../projectEntities/seasonWords'
import { ScriptEditor } from './ScriptEditor'
import { Button } from '../Button'
import { FolderInput, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'

/** A season's episodes, each with its menu, and with its pages or its script when opened. */
export function SeasonEpisodes({
  projectId,
  universeId,
  pages,
  seasons,
  busy,
  editing,
  setEditing,
  say,
  refresh,
  run,
  season,
}: {
  projectId: string
  universeId: string
  pages: boolean
  seasons: ProjectSeason[]
  busy: boolean
  editing: string | null
  setEditing: Dispatch<SetStateAction<string | null>>
  say: (typeof WORDS)[ProjectStructureWords]
  refresh: () => Promise<void>
  run: (work: () => Promise<unknown>) => void
  season: ProjectSeason
}) {
  useI18n()

  return (
    <ol className="fieldlist" data-testid={`project-episodes-${season.id}`}>
      {season.episodes.map((episode, place) => (
        <li
          key={episode.id}
          className="fieldlist__row"
          data-testid={`project-episode-${episode.id}`}
        >
          <span className="fieldlist__text">
            <span className="fieldlist__name">{episode.title}</span>
            <span className="fieldlist__meta">
              {episode.hasScript
                ? t('projects.seasons.hasScript', { count: String(episode.scriptLength) })
                : t('projects.seasons.noScript')}
            </span>
          </span>
          {/* The script is what an author opens an episode for, so it stays on the row. Order, moving to
                      another season and deleting are the row's secondary verbs and go in its menu. */}
          <div className="fieldlist__actions">
            <Button
              tone="secondary"
              size="sm"
              data-testid={`project-episode-open-${episode.id}`}
              onClick={() => setEditing(editing === episode.id ? null : episode.id)}
            >
              {editing === episode.id
                ? t('projects.seasons.closeScript')
                : t('projects.seasons.openScript')}
            </Button>
            <ActionMenu
              label={t('projects.common.more', { name: episode.title })}
              triggerTestId={`project-episode-actions-${episode.id}`}
            >
              <MoveItems
                first={place === 0}
                last={place === season.episodes.length - 1}
                busy={busy}
                testIds={{
                  up: `project-episode-up-${episode.id}`,
                  down: `project-episode-down-${episode.id}`,
                }}
                onMove={(step) =>
                  run(() => moveEpisode(projectId, season.id, episode.id, { place: place + step }))
                }
              />
              {/* Moving between seasons needs no drag: the other seasons are a short list of items. */}
              {seasons
                .filter((other) => other.id !== season.id)
                .map((other) => (
                  <button
                    className="actionmenu__item"
                    key={other.id}
                    type="button"
                    disabled={busy}
                    data-testid={`project-episode-to-${episode.id}-${other.id}`}
                    onClick={() =>
                      run(() =>
                        moveEpisode(projectId, season.id, episode.id, {
                          place: other.episodes.length,
                          seasonId: other.id,
                        }),
                      )
                    }
                  >
                    <ActionIcon icon={FolderInput} />
                    {say.moveToSeason()} {other.name}
                  </button>
                ))}
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={busy}
                data-testid={`project-episode-delete-${episode.id}`}
                onClick={() => run(() => deleteEpisode(projectId, season.id, episode.id))}
              >
                <ActionIcon icon={Trash} />
                {say.deleteEpisode()}
              </button>
            </ActionMenu>
          </div>
          {/* Only a comic has a level below the chapter (#147). */}
          {pages ? (
            <ChapterPages
              projectId={projectId}
              universeId={universeId}
              volumeId={season.id}
              chapterId={episode.id}
            />
          ) : null}
          {editing === episode.id ? (
            <ScriptEditor
              projectId={projectId}
              seasonId={season.id}
              episode={episode}
              onSaved={() => {
                setEditing(null)
                void refresh()
              }}
            />
          ) : null}
        </li>
      ))}
    </ol>
  )
}
