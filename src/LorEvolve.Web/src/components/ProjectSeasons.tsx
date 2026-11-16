import { useEffect, useState } from 'react'
import { Field } from './Field'
import {
  createEpisode,
  createSeason,
  deleteEpisode,
  deleteSeason,
  getEpisode,
  listSeasons,
  moveEpisode,
  moveSeason,
  saveEpisode,
  saveSeason,
  type ProjectEpisodeSummary,
  type ProjectSeason,
} from '../projectEntities/seasons'
import { ActionMenu } from './ActionMenu'
import { ChapterPages } from './ChapterPages'
import { EmptyState } from './EmptyState'
import { t, tn, useI18n } from '../i18n'

/**
 * The seasons of a project and the episodes in them (#145).
 *
 * <p>Offered to every project rather than only a Series, because a comic has volumes and issues and a project that
 * does not work this way can leave it empty. Order is moved one place at a time, up or down, which is the plainest
 * control that works with a keyboard and needs no drag.</p>
 */
/**
 * The words a kind of project uses for the same structure. A film is cut into sequences of scenes and a series into
 * seasons of episodes; the rows are the same, so the component is too and only the labels differ (#146).
 *
 * Every key that differs is listed here rather than chosen with a conditional at each use: a label that only one of
 * the two kinds has would otherwise be easy to miss, and `satisfies` makes the two sets provably the same shape.
 */
const WORDS = {
  seasons: {
    title: () => t('projects.seasons.title'),
    lede: () => t('projects.seasons.lede'),
    empty: () => t('projects.seasons.empty'),
    emptyHint: () => t('projects.seasons.emptyHint'),
    add: () => t('projects.seasons.add'),
    delete: () => t('projects.seasons.delete'),
    noEpisodes: () => t('projects.seasons.noEpisodes'),
    episodeCount: (count: number) => tn('projects.seasons.episodeCount', count),
    addEpisode: () => t('projects.seasons.addEpisode'),
    deleteEpisode: () => t('projects.seasons.deleteEpisode'),
    moveToSeason: () => t('projects.seasons.moveToSeason'),
  },
  volumes: {
    title: () => t('projects.volumes.title'),
    lede: () => t('projects.volumes.lede'),
    empty: () => t('projects.volumes.empty'),
    emptyHint: () => t('projects.volumes.emptyHint'),
    add: () => t('projects.volumes.add'),
    delete: () => t('projects.volumes.delete'),
    noEpisodes: () => t('projects.volumes.noEpisodes'),
    episodeCount: (count: number) => tn('projects.volumes.episodeCount', count),
    addEpisode: () => t('projects.volumes.addEpisode'),
    deleteEpisode: () => t('projects.volumes.deleteEpisode'),
    moveToSeason: () => t('projects.volumes.moveToSeason'),
  },
  sequences: {
    title: () => t('projects.sequences.title'),
    lede: () => t('projects.sequences.lede'),
    empty: () => t('projects.sequences.empty'),
    emptyHint: () => t('projects.sequences.emptyHint'),
    add: () => t('projects.sequences.add'),
    delete: () => t('projects.sequences.delete'),
    noEpisodes: () => t('projects.sequences.noEpisodes'),
    episodeCount: (count: number) => tn('projects.sequences.episodeCount', count),
    addEpisode: () => t('projects.sequences.addEpisode'),
    deleteEpisode: () => t('projects.sequences.deleteEpisode'),
    moveToSeason: () => t('projects.sequences.moveToSeason'),
  },
} as const

export type ProjectStructureWords = keyof typeof WORDS

export function ProjectSeasons({
  projectId,
  universeId,
  words = 'seasons',
  pages = false,
}: {
  projectId: string
  /** The project's universe, for the lore a comic's panels may name (#147). */
  universeId: string
  /** Which vocabulary to draw: a series' seasons, a film's sequences, or a comic's volumes. */
  words?: ProjectStructureWords
  /** Whether a chapter opens its pages and panels, which only a comic has. */
  pages?: boolean
}) {
  useI18n()
  const [seasons, setSeasons] = useState<ProjectSeason[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const say = WORDS[words]

  useEffect(() => {
    const controller = new AbortController()
    listSeasons(projectId, controller.signal)
      .then(setSeasons)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setSeasons([])
        setFailed(error instanceof Error ? error.message : t('projects.seasons.failed'))
      })
    return () => controller.abort()
  }, [projectId])

  function refresh() {
    return listSeasons(projectId)
      .then((read) => {
        setSeasons(read)
        setBusy(false)
        setFailed(null)
      })
      .catch(failing)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.seasons.failed'))
  }

  function run(work: Promise<unknown>) {
    setBusy(true)
    work.then(refresh).catch(failing)
  }

  if (seasons === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  return (
    <section className="projects" data-testid="project-seasons">
      <header className="projects__head">
        <div className="projects__headtext">
          <h2 className="sectionrule">{say.title()}</h2>
          <p className="projects__lede">{say.lede()}</p>
        </div>
        <button
          className="button"
          type="button"
          aria-expanded={adding}
          data-testid="project-season-add"
          onClick={() => setAdding((open) => !open)}
        >
          {say.add()}
        </button>
      </header>

      {/* Asked for rather than standing open at the foot of the list. */}
      {adding ? (
        <form
          className="form"
          data-testid="project-season-new"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            setBusy(true)
            createSeason(projectId, { name, summary: null })
              .then(() => {
                setName('')
                setAdding(false)
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
                value={name}
                onChange={(event) => setName(event.target.value)}
                data-testid="project-season-new-name"
                required
              />
            )}
          </Field>
          <div className="form__actions">
            <button
              className="button"
              type="submit"
              disabled={busy}
              data-testid="project-season-new-save"
            >
              {busy ? t('projects.seasons.saving') : say.add()}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setAdding(false)}
              data-testid="project-season-new-cancel"
            >
              {t('projects.common.cancel')}
            </button>
          </div>
        </form>
      ) : null}

      {failed ? (
        <p role="alert" data-testid="project-seasons-failed">
          {failed}
        </p>
      ) : null}

      {seasons.length === 0 ? (
        <EmptyState title={say.empty()} hint={say.emptyHint()} testId="project-seasons-empty" />
      ) : null}

      <ol className="projectcardlist" data-testid="project-season-list">
        {seasons.map((season, index) => (
          <li key={season.id} className="projectcard" data-testid={`project-season-${season.id}`}>
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
                <button
                  className="button button--sm"
                  type="submit"
                  disabled={busy}
                  data-testid="project-season-rename-save"
                >
                  {t('projects.seasons.renameSave')}
                </button>
                {/* Without this the only way out of a rename the author thought better of was to save it. */}
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  disabled={busy}
                  onClick={() => setRenaming(null)}
                  data-testid="project-season-rename-cancel"
                >
                  {t('projects.common.cancel')}
                </button>
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
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      data-testid={`project-episode-open-${episode.id}`}
                      onClick={() => setEditing(editing === episode.id ? null : episode.id)}
                    >
                      {editing === episode.id
                        ? t('projects.seasons.closeScript')
                        : t('projects.seasons.openScript')}
                    </button>
                    <ActionMenu
                      label={t('projects.common.more', { name: episode.title })}
                      triggerTestId={`project-episode-actions-${episode.id}`}
                    >
                      {place === 0 ? null : (
                        <button
                          className="actionmenu__item"
                          type="button"
                          disabled={busy}
                          data-testid={`project-episode-up-${episode.id}`}
                          onClick={() =>
                            run(moveEpisode(projectId, season.id, episode.id, { place: place - 1 }))
                          }
                        >
                          {t('projects.common.moveUp')}
                        </button>
                      )}
                      {place === season.episodes.length - 1 ? null : (
                        <button
                          className="actionmenu__item"
                          type="button"
                          disabled={busy}
                          data-testid={`project-episode-down-${episode.id}`}
                          onClick={() =>
                            run(moveEpisode(projectId, season.id, episode.id, { place: place + 1 }))
                          }
                        >
                          {t('projects.common.moveDown')}
                        </button>
                      )}
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
                              run(
                                moveEpisode(projectId, season.id, episode.id, {
                                  place: other.episodes.length,
                                  seasonId: other.id,
                                }),
                              )
                            }
                          >
                            {say.moveToSeason()} {other.name}
                          </button>
                        ))}
                      <button
                        className="actionmenu__item actionmenu__item--danger"
                        type="button"
                        disabled={busy}
                        data-testid={`project-episode-delete-${episode.id}`}
                        onClick={() => run(deleteEpisode(projectId, season.id, episode.id))}
                      >
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
              <button
                className="button button--text button--sm"
                type="button"
                data-testid={`project-episode-add-${season.id}`}
                onClick={() => setAddingTo(season.id)}
              >
                {say.addEpisode()}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function EpisodeForm({
  busy,
  addLabel,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  /** "Add an episode" or "Add a scene", from the project's own vocabulary. */
  addLabel: string
  onSubmit: (title: string, synopsis: string | null) => void
  onCancel: () => void
}) {
  useI18n()
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')

  return (
    <form
      className="form"
      data-testid="project-episode-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit(title, synopsis.length > 0 ? synopsis : null)
      }}
    >
      <Field label={t('projects.seasons.episodeTitle')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            data-testid="project-episode-new-title"
            required
          />
        )}
      </Field>
      <Field label={t('projects.seasons.synopsis')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={synopsis}
            onChange={(event) => setSynopsis(event.target.value)}
            data-testid="project-episode-new-synopsis"
          />
        )}
      </Field>
      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={busy}
          data-testid="project-episode-new-save"
        >
          {addLabel}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={onCancel}
          data-testid="project-episode-new-cancel"
        >
          {t('projects.common.cancel')}
        </button>
      </div>
    </form>
  )
}

/**
 * One episode's script. Read on open rather than carried by the list, and saved over the version it was read at, so a
 * save made over someone else's is refused instead of overwriting it.
 */
function ScriptEditor({
  projectId,
  seasonId,
  episode,
  onSaved,
}: {
  projectId: string
  seasonId: string
  episode: ProjectEpisodeSummary
  onSaved: () => void
}) {
  useI18n()
  const [script, setScript] = useState<string | null>(null)
  const [title, setTitle] = useState(episode.title)
  const [synopsis, setSynopsis] = useState(episode.synopsis ?? '')
  const [version, setVersion] = useState(episode.version)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getEpisode(projectId, seasonId, episode.id, controller.signal)
      .then((read) => {
        setScript(read.script ?? '')
        setTitle(read.title)
        setSynopsis(read.synopsis ?? '')
        setVersion(read.version)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailed(error instanceof Error ? error.message : t('projects.seasons.failed'))
      })
    return () => controller.abort()
  }, [projectId, seasonId, episode.id])

  return (
    <form
      className="form"
      data-testid={`project-script-${episode.id}`}
      onSubmit={(event) => {
        event.preventDefault()
        if (saving || script === null) return
        setSaving(true)
        setFailed(null)
        saveEpisode(projectId, seasonId, episode.id, {
          title,
          synopsis: synopsis.length > 0 ? synopsis : null,
          script: script.length > 0 ? script : null,
          expectedVersion: version,
        })
          .then(onSaved)
          .catch((error: unknown) => {
            setSaving(false)
            // `ApiError`'s message is already the refusal in the reader's language (#108); the stale case gets its own
            // sentence, because what matters is that nothing was overwritten.
            const code = (error as { code?: string }).code
            setFailed(
              code === 'project_episode_changed'
                ? t('projects.seasons.scriptStale')
                : error instanceof Error
                  ? error.message
                  : t('projects.seasons.failed'),
            )
          })
      }}
    >
      {failed ? (
        <p
          className="form__message"
          role="alert"
          data-testid={`project-script-failed-${episode.id}`}
        >
          {failed}
        </p>
      ) : null}

      <Field label={t('projects.seasons.episodeTitle')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            data-testid={`project-script-title-${episode.id}`}
            required
          />
        )}
      </Field>

      <Field label={t('projects.seasons.synopsis')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={synopsis}
            onChange={(event) => setSynopsis(event.target.value)}
            data-testid={`project-script-synopsis-${episode.id}`}
          />
        )}
      </Field>

      {/*
       * Drawn only once the stored script has arrived. Showing an empty field first and filling it in on arrival would
       * take back what the author typed in between, which the E2E spec caught doing exactly that.
       */}
      {script === null ? (
        <p className="projectcard__meta">{t('projects.common.loading')}</p>
      ) : (
        <Field label={t('projects.seasons.script')}>
          {(control) => (
            <textarea
              {...control}
              className="field__input"
              rows={12}
              value={script}
              onChange={(event) => setScript(event.target.value)}
              data-testid={`project-script-text-${episode.id}`}
            />
          )}
        </Field>
      )}

      <div className="form__actions">
        <button
          className="button"
          type="submit"
          disabled={saving || script === null}
          data-testid={`project-script-save-${episode.id}`}
        >
          {saving ? t('projects.seasons.savingScript') : t('projects.seasons.saveScript')}
        </button>
      </div>
    </form>
  )
}
