import { Field } from '../Field'
import {
  createEpisode,
  deleteSeason,
  moveSeason,
  saveSeason,
  type ProjectSeason,
} from '../../projectEntities/seasons'
import { ActionMenu } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { ProjectStructureWords, WORDS } from '../../projectEntities/seasonWords'
import { EpisodeForm } from './EpisodeForm'
import { SeasonEpisodes } from './SeasonEpisodes'
import { NewButton } from '../NewButton'
import { FormActions } from '../FormActions'
import { Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ProjectCard } from '../ProjectCard'
import { confirmAction } from '../../lib/confirm'
import { useDiscardGuard } from '../../lib/useDiscardGuard'

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
  run: (work: () => Promise<unknown>) => void
  season: ProjectSeason
  index: number
}) {
  useI18n()
  const { confirmLeave } = useDiscardGuard(
    renaming === season.id && renameTo !== season.name && !busy,
    say.leave(),
  )

  async function remove() {
    const confirmed = await confirmAction({
      title: t('projects.structure.deleteTitle', { name: season.name }),
      message: t('projects.structure.deleteEmpty'),
      confirmLabel: say.delete(),
      variant: 'destructive',
    })
    if (confirmed) run(() => deleteSeason(projectId, season.id))
  }

  return (
    <ProjectCard
      testId={`project-season-${season.id}`}
      title={season.name}
      meta={
        season.episodes.length === 0 ? say.noEpisodes() : say.episodeCount(season.episodes.length)
      }
      head={
        renaming === season.id ? (
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
            <Field label={t('projects.seasons.name')} requiredMark>
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
            {/* Without this the only way out of a rename the author thought better of was to save it. */}
            <FormActions
              submitLabel={t('projects.seasons.renameSave')}
              busy={busy}
              submitTestId="project-season-rename-save"
              onCancel={() => void confirmLeave().then((ok) => ok && setRenaming(null))}
              cancelTestId="project-season-rename-cancel"
              lockCancel
              size="sm"
            />
          </form>
        ) : undefined
      }
      // Order, rename and delete are this row's secondary verbs: one menu, as the lore types screen does,
      // rather than four pills on every card.
      actions={
        <ActionMenu
          label={t('projects.common.more', { name: season.name })}
          triggerTestId={`project-season-actions-${season.id}`}
        >
          <MoveItems
            first={index === 0}
            last={index === seasons.length - 1}
            busy={busy}
            testIds={{
              up: `project-season-up-${season.id}`,
              down: `project-season-down-${season.id}`,
            }}
            onMove={(step) => run(() => moveSeason(projectId, season.id, { place: index + step }))}
          />
          <button
            className="actionmenu__item"
            type="button"
            data-testid={`project-season-rename-${season.id}`}
            onClick={() => {
              setRenaming(season.id)
              setRenameTo(season.name)
            }}
          >
            <ActionIcon icon={Pencil} />
            {t('projects.seasons.rename')}
          </button>
          <button
            className="actionmenu__item actionmenu__item--danger"
            type="button"
            disabled={busy}
            data-testid={`project-season-delete-${season.id}`}
            onClick={() => void remove()}
          >
            <ActionIcon icon={Trash} />
            {say.delete()}
          </button>
        </ActionMenu>
      }
    >
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
          leaveMessage={say.leaveEpisode()}
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
        <NewButton
          tone="secondary"
          size="sm"
          data-testid={`project-episode-add-${season.id}`}
          onClick={() => setAddingTo(season.id)}
        >
          {say.addEpisode()}
        </NewButton>
      )}
    </ProjectCard>
  )
}
