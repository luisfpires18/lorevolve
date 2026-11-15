import { useEffect, useState } from 'react'
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
import { EmptyState } from './EmptyState'
import { t, tn, useI18n } from '../i18n'

/**
 * The seasons of a project and the episodes in them (#145).
 *
 * <p>Offered to every project rather than only a Series, because a comic has volumes and issues and a project that
 * does not work this way can leave it empty. Order is moved one place at a time, up or down, which is the plainest
 * control that works with a keyboard and needs no drag.</p>
 */
export function ProjectSeasons({ projectId }: { projectId: string }) {
  useI18n()
  const [seasons, setSeasons] = useState<ProjectSeason[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

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
    return <p className="projects__lede">{t('projects.seasons.loading')}</p>
  }

  return (
    <section className="projects" data-testid="project-seasons">
      <header className="projects__head">
        <h2>{t('projects.seasons.title')}</h2>
        <p className="projects__lede">{t('projects.seasons.lede')}</p>
      </header>

      {failed ? (
        <p role="alert" data-testid="project-seasons-failed">
          {failed}
        </p>
      ) : null}

      {seasons.length === 0 ? (
        <EmptyState
          title={t('projects.seasons.empty')}
          hint={t('projects.seasons.emptyHint')}
          testId="project-seasons-empty"
        />
      ) : null}

      <ol className="cardlist" data-testid="project-season-list">
        {seasons.map((season, index) => (
          <li key={season.id} className="card" data-testid={`project-season-${season.id}`}>
            {renaming === season.id ? (
              <form
                className="form form--inline"
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
                <label className="field">
                  <span className="field__label">{t('projects.seasons.name')}</span>
                  <input
                    className="field__input"
                    value={renameTo}
                    onChange={(event) => setRenameTo(event.target.value)}
                    data-testid="project-season-rename-name"
                    required
                  />
                </label>
                <button type="submit" disabled={busy} data-testid="project-season-rename-save">
                  {t('projects.seasons.renameSave')}
                </button>
              </form>
            ) : (
              <div className="card__head">
                <h3 className="card__title">{season.name}</h3>
                <p className="projects__lede">
                  {season.episodes.length === 0
                    ? t('projects.seasons.noEpisodes')
                    : tn('projects.seasons.episodeCount', season.episodes.length)}
                </p>
                <div className="card__actions">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    data-testid={`project-season-up-${season.id}`}
                    onClick={() => run(moveSeason(projectId, season.id, { place: index - 1 }))}
                  >
                    {t('projects.seasons.moveUp')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === seasons.length - 1}
                    data-testid={`project-season-down-${season.id}`}
                    onClick={() => run(moveSeason(projectId, season.id, { place: index + 1 }))}
                  >
                    {t('projects.seasons.moveDown')}
                  </button>
                  <button
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
                    type="button"
                    disabled={busy}
                    data-testid={`project-season-delete-${season.id}`}
                    onClick={() => run(deleteSeason(projectId, season.id))}
                  >
                    {t('projects.seasons.delete')}
                  </button>
                </div>
              </div>
            )}

            {season.summary ? <p>{season.summary}</p> : null}

            <ol data-testid={`project-episodes-${season.id}`}>
              {season.episodes.map((episode, place) => (
                <li key={episode.id} data-testid={`project-episode-${episode.id}`}>
                  <span>{episode.title}</span>{' '}
                  <span className="projects__lede">
                    {episode.hasScript
                      ? t('projects.seasons.hasScript', { count: String(episode.scriptLength) })
                      : t('projects.seasons.noScript')}
                  </span>
                  <button
                    type="button"
                    disabled={busy || place === 0}
                    data-testid={`project-episode-up-${episode.id}`}
                    onClick={() =>
                      run(moveEpisode(projectId, season.id, episode.id, { place: place - 1 }))
                    }
                  >
                    {t('projects.seasons.moveUp')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || place === season.episodes.length - 1}
                    data-testid={`project-episode-down-${episode.id}`}
                    onClick={() =>
                      run(moveEpisode(projectId, season.id, episode.id, { place: place + 1 }))
                    }
                  >
                    {t('projects.seasons.moveDown')}
                  </button>
                  {/* Moving between seasons needs no drag: the other seasons are a short list of buttons. */}
                  {seasons
                    .filter((other) => other.id !== season.id)
                    .map((other) => (
                      <button
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
                        {t('projects.seasons.moveToSeason')} {other.name}
                      </button>
                    ))}
                  <button
                    type="button"
                    data-testid={`project-episode-open-${episode.id}`}
                    onClick={() => setEditing(editing === episode.id ? null : episode.id)}
                  >
                    {editing === episode.id
                      ? t('projects.seasons.closeScript')
                      : t('projects.seasons.openScript')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`project-episode-delete-${episode.id}`}
                    onClick={() => run(deleteEpisode(projectId, season.id, episode.id))}
                  >
                    {t('projects.seasons.deleteEpisode')}
                  </button>
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
                type="button"
                data-testid={`project-episode-add-${season.id}`}
                onClick={() => setAddingTo(season.id)}
              >
                {t('projects.seasons.addEpisode')}
              </button>
            )}
          </li>
        ))}
      </ol>

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
              return refresh()
            })
            .catch(failing)
        }}
      >
        <h3>{t('projects.seasons.add')}</h3>
        <label className="field">
          <span className="field__label">{t('projects.seasons.name')}</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.seasons.namePlaceholder')}
            data-testid="project-season-new-name"
            required
          />
        </label>
        <button type="submit" disabled={busy} data-testid="project-season-new-save">
          {busy ? t('projects.seasons.saving') : t('projects.seasons.save')}
        </button>
      </form>
    </section>
  )
}

function EpisodeForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean
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
      <label className="field">
        <span className="field__label">{t('projects.seasons.episodeTitle')}</span>
        <input
          className="field__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('projects.seasons.episodeTitlePlaceholder')}
          data-testid="project-episode-new-title"
          required
        />
      </label>
      <label className="field">
        <span className="field__label">{t('projects.seasons.synopsis')}</span>
        <input
          className="field__input"
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          placeholder={t('projects.seasons.synopsisPlaceholder')}
          data-testid="project-episode-new-synopsis"
        />
      </label>
      <button type="submit" disabled={busy} data-testid="project-episode-new-save">
        {t('projects.seasons.saveEpisode')}
      </button>
      <button type="button" onClick={onCancel} data-testid="project-episode-new-cancel">
        {t('projects.seasons.closeScript')}
      </button>
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
        <p role="alert" data-testid={`project-script-failed-${episode.id}`}>
          {failed}
        </p>
      ) : null}

      <label className="field">
        <span className="field__label">{t('projects.seasons.episodeTitle')}</span>
        <input
          className="field__input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          data-testid={`project-script-title-${episode.id}`}
          required
        />
      </label>

      <label className="field">
        <span className="field__label">{t('projects.seasons.synopsis')}</span>
        <input
          className="field__input"
          value={synopsis}
          onChange={(event) => setSynopsis(event.target.value)}
          data-testid={`project-script-synopsis-${episode.id}`}
        />
      </label>

      <label className="field">
        <span className="field__label">{t('projects.seasons.script')}</span>
        <textarea
          className="field__input"
          rows={12}
          value={script ?? ''}
          onChange={(event) => setScript(event.target.value)}
          placeholder={t('projects.seasons.scriptPlaceholder')}
          data-testid={`project-script-text-${episode.id}`}
        />
      </label>

      <button
        type="submit"
        disabled={saving || script === null}
        data-testid={`project-script-save-${episode.id}`}
      >
        {saving ? t('projects.seasons.savingScript') : t('projects.seasons.saveScript')}
      </button>
    </form>
  )
}
