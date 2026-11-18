import { useEffect, useState } from 'react'
import { Field } from './Field'
import { createSeason, listSeasons, type ProjectSeason } from '../projectEntities/seasons'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'
import { WORDS, type ProjectStructureWords } from '../projectEntities/seasonWords'
import { SeasonItem } from './projectEntities/SeasonItem'
import { NewButton } from './NewButton'
import { FormActions } from './FormActions'

/**
 * The seasons of a project and the episodes in them (#145).
 *
 * <p>Offered to every project rather than only a Series, because a comic has volumes and issues and a project that
 * does not work this way can leave it empty. Order is moved one place at a time, up or down, which is the plainest
 * control that works with a keyboard and needs no drag.</p>
 */

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
        <NewButton
          aria-expanded={adding}
          data-testid="project-season-add"
          onClick={() => setAdding((open) => !open)}
        >
          {say.add()}
        </NewButton>
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
          <FormActions
            submitLabel={say.add()}
            busy={busy}
            busyLabel={t('projects.seasons.saving')}
            submitTestId="project-season-new-save"
            onCancel={() => setAdding(false)}
            cancelTestId="project-season-new-cancel"
            inline
          />
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
          <SeasonItem
            key={season.id}
            projectId={projectId}
            universeId={universeId}
            pages={pages}
            seasons={seasons}
            busy={busy}
            setBusy={setBusy}
            renaming={renaming}
            setRenaming={setRenaming}
            renameTo={renameTo}
            setRenameTo={setRenameTo}
            addingTo={addingTo}
            setAddingTo={setAddingTo}
            editing={editing}
            setEditing={setEditing}
            say={say}
            refresh={refresh}
            failing={failing}
            run={run}
            season={season}
            index={index}
          />
        ))}
      </ol>
    </section>
  )
}
