import { Field } from '../Field'
import {
  createEpisode,
  deleteSeason,
  moveSeason,
  saveSeason,
  type ProjectSeason,
} from '../../projectEntities/seasons'
import { ActionMenu } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { ProjectStructureWords, WORDS } from '../../projectEntities/seasonWords'
import { EpisodeForm } from './EpisodeForm'
import { SeasonEpisodes } from './SeasonEpisodes'
import { Button } from '../Button'

/** One season: its rename form, its head and menu, its summary, its episodes and the form to add one. */
export function SeasonItem({
  projectId,
  universeId,
  pages,
  seasons,
  busy,
  setBusy,
  renaming,
  setRenaming,
  renameTo,
  setRenameTo,
  addingTo,
  setAddingTo,
  editing,
  setEditing,
  say,
  refresh,
  failing,
  run,
  season,
  index,
}: {
  projectId: string
  universeId: string
  pages: boolean
  seasons: ProjectSeason[]
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  renaming: string | null
  setRenaming: Dispatch<SetStateAction<string | null>>
  renameTo: string
  setRenameTo: Dispatch<SetStateAction<string>>
  addingTo: string | null
  setAddingTo: Dispatch<SetStateAction<string | null>>
  editing: string | null
  setEditing: Dispatch<SetStateAction<string | null>>
  say: (typeof WORDS)[ProjectStructureWords]
  refresh: () => Promise<void>
  failing: (error: unknown) => void
  run: (work: Promise<unknown>) => void
  season: ProjectSeason
  index: number
}) {
  useI18n()

  return (
    <li className="projectcard" data-testid={`project-season-${season.id}`}>
      {renaming === season.id ? (
        <form
          className="form projectform--inline"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            saveSeason(projectId, season.id, { name: renameTo, summary: season.summary })
              .then(() => {
                setRenaming(null)
                return refresh()
              })
              .catch(failing)
          }}
        >
          <Field label={t('projects.seasons.name')}>
            {(control) => (
              <input
                {...control}
                className="field__input"
                value={renameTo}
                onChange={(event) => setRenameTo(event.target.value)}
                data-testid="project-season-rename-name"
                required
              />
            )}
          </Field>
          <Button size="sm" type="submit" disabled={busy} data-testid="project-season-rename-save">
            {t('projects.seasons.renameSave')}
          </Button>
          {/* Without this the only way out of a rename the author thought better of was to save it. */}
          <Button
            tone="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setRenaming(null)}
            data-testid="project-season-rename-cancel"
          >
            {t('projects.common.cancel')}
          </Button>
        </form>
      ) : (
        <div className="projectcard__head">
          <h3 className="projectcard__title">{season.name}</h3>
          <p className="projectcard__meta">
            {season.episodes.length === 0
              ? say.noEpisodes()
              : say.episodeCount(season.episodes.length)}
          </p>
          {/* Order, rename and delete are this row's secondary verbs: one menu, as the lore types screen does,
                    rather than four pills on every card. */}
          <div className="projectcard__actions">
            <ActionMenu
              label={t('projects.common.more', { name: season.name })}
              triggerTestId={`project-season-actions-${season.id}`}
            >
              {index === 0 ? null : (
                <button
                  className="actionmenu__item"
                  type="button"
                  disabled={busy}
                  data-testid={`project-season-up-${season.id}`}
                  onClick={() => run(moveSeason(projectId, season.id, { place: index - 1 }))}
                >
                  {t('projects.common.moveUp')}
                </button>
              )}
              {index === seasons.length - 1 ? null : (
                <button
                  className="actionmenu__item"
                  type="button"
                  disabled={busy}
                  data-testid={`project-season-down-${season.id}`}
                  onClick={() => run(moveSeason(projectId, season.id, { place: index + 1 }))}
                >
                  {t('projects.common.moveDown')}
                </button>
              )}
              <button
                className="actionmenu__item"
                type="button"
                data-testid={`project-season-rename-${season.id}`}
                onClick={() => {
                  setRenaming(season.id)
                  setRenameTo(season.name)
                }}
              >
                {t('projects.seasons.rename')}
              </button>
              <button
                className="actionmenu__item actionmenu__item--danger"
                type="button"
                disabled={busy}
                data-testid={`project-season-delete-${season.id}`}
                onClick={() => run(deleteSeason(projectId, season.id))}
              >
                {say.delete()}
              </button>
            </ActionMenu>
          </div>
        </div>
      )}

      {season.summary ? <p className="prose">{season.summary}</p> : null}

      <SeasonEpisodes
        projectId={projectId}
        universeId={universeId}
        pages={pages}
        seasons={seasons}
        busy={busy}
        editing={editing}
        setEditing={setEditing}
        say={say}
        refresh={refresh}
        run={run}
        season={season}
      />

      {addingTo === season.id ? (
        <EpisodeForm
          busy={busy}
          addLabel={say.addEpisode()}
          onCancel={() => setAddingTo(null)}
          onSubmit={(title, synopsis) => {
            setBusy(true)
            createEpisode(projectId, season.id, {
              title,
              synopsis,
              script: null,
              expectedVersion: null,
            })
              .then(() => {
                setAddingTo(null)
                return refresh()
              })
              .catch(failing)
          }}
        />
      ) : (
        <Button
          tone="text"
          size="sm"
          data-testid={`project-episode-add-${season.id}`}
          onClick={() => setAddingTo(season.id)}
        >
          {say.addEpisode()}
        </Button>
      )}
    </li>
  )
}
