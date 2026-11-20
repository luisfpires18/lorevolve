import { deleteEpisode, moveEpisode, type ProjectSeason } from '../../projectEntities/seasons'
import { ActionMenu, ActionMenuItem } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { ChapterPages } from '../ChapterPages'
import { t, useI18n } from '../../i18n'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { confirmAction } from '../../lib/confirm'
import { useDiscardGuard } from '../../lib/useDiscardGuard'
import type { ProjectStructureWords, WORDS } from '../../projectEntities/seasonWords'
import { ScriptEditor } from './ScriptEditor'
import { Button } from '../Button'
import { FolderInput, Trash } from 'lucide-react'

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
  const [scriptDirty, setScriptDirty] = useState(false)
  const { confirmLeave } = useDiscardGuard(scriptDirty, say.leaveEpisode())

  /** Closing a script, or opening another over it, asks first when it has unsaved changes. */
  async function toggle(episodeId: string) {
    if (!(await confirmLeave())) return
    setScriptDirty(false)
    setEditing(editing === episodeId ? null : episodeId)
  }

  async function remove(episodeId: string, title: string) {
    const confirmed = await confirmAction({
      title: t('projects.structure.deleteTitle', { name: title }),
      message: t('projects.structure.deleteEmpty'),
      confirmLabel: say.deleteEpisode(),
      variant: 'destructive',
    })
    if (confirmed) run(() => deleteEpisode(projectId, season.id, episodeId))
  }

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
          <div className="actions actions--compact fieldlist__actions">
            <Button
              tone="secondary"
              size="sm"
              data-testid={`project-episode-open-${episode.id}`}
              onClick={() => void toggle(episode.id)}
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
                  <ActionMenuItem
                    icon={FolderInput}
                    key={other.id}
                    disabled={busy}
                    testId={`project-episode-to-${episode.id}-${other.id}`}
                    onClick={() =>
                      run(() =>
                        moveEpisode(projectId, season.id, episode.id, {
                          place: other.episodes.length,
                          seasonId: other.id,
                        }),
                      )
                    }
                  >
                    {say.moveToSeason()} {other.name}
                  </ActionMenuItem>
                ))}
              <ActionMenuItem
                icon={Trash}
                tone="danger"
                disabled={busy}
                testId={`project-episode-delete-${episode.id}`}
                onClick={() => void remove(episode.id, episode.title)}
              >
                {say.deleteEpisode()}
              </ActionMenuItem>
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
              onDirtyChange={setScriptDirty}
              onSaved={() => {
                setScriptDirty(false)
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
