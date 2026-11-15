import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  createPage,
  createPanel,
  deletePage,
  deletePanel,
  listPages,
  movePage,
  movePanel,
  savePanel,
  type ProjectPage,
} from '../projectEntities/pages'
import { EntityPicker } from './EntityPicker'
import { t, tn, useI18n } from '../i18n'

/**
 * The pages of one comic chapter and the panels on them (#147).
 *
 * <p>Folded away until asked for: a chapter has pages, a page has panels, and drawing all of it under every chapter at
 * once would bury the chapter list it hangs from. Order moves one place at a time, up or down, as every other place in
 * these screens does.</p>
 *
 * <p>A panel shows what happens and what is said, and names a lore entry rather than carrying art. That is the
 * existing Media feature doing its job: the named entry's picture is served on the entry's own route, and this screen
 * links to it rather than uploading a second copy.</p>
 */
export function ChapterPages({
  projectId,
  universeId,
  volumeId,
  chapterId,
}: {
  projectId: string
  /** The project's universe: whose lore a panel may name, and where a named entry is read. */
  universeId: string
  volumeId: string
  chapterId: string
}) {
  useI18n()
  const [open, setOpen] = useState(false)
  const [pages, setPages] = useState<ProjectPage[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [addingTo, setAddingTo] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const controller = new AbortController()
    listPages(projectId, volumeId, chapterId, controller.signal)
      .then(setPages)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setPages([])
        setFailed(error instanceof Error ? error.message : t('projects.pages.failed'))
      })
    return () => controller.abort()
  }, [open, projectId, volumeId, chapterId])

  function refresh() {
    return listPages(projectId, volumeId, chapterId)
      .then((read) => {
        setPages(read)
        setBusy(false)
        setFailed(null)
      })
      .catch(failing)
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(error instanceof Error ? error.message : t('projects.pages.failed'))
  }

  function run(work: Promise<unknown>) {
    setBusy(true)
    work.then(refresh).catch(failing)
  }

  if (!open) {
    return (
      <button
        type="button"
        data-testid={`chapter-pages-open-${chapterId}`}
        onClick={() => setOpen(true)}
      >
        {t('projects.pages.open')}
      </button>
    )
  }

  return (
    <section data-testid={`chapter-pages-${chapterId}`}>
      <h4>{t('projects.pages.title')}</h4>

      <button
        type="button"
        data-testid={`chapter-pages-close-${chapterId}`}
        onClick={() => setOpen(false)}
      >
        {t('projects.pages.close')}
      </button>

      {failed ? (
        <p role="alert" data-testid={`chapter-pages-failed-${chapterId}`}>
          {failed}
        </p>
      ) : null}

      {pages === null ? <p className="projects__lede">{t('projects.pages.loading')}</p> : null}

      {pages !== null && pages.length === 0 ? (
        <p className="projects__lede">{t('projects.pages.empty')}</p>
      ) : null}

      <ol data-testid={`chapter-page-list-${chapterId}`}>
        {(pages ?? []).map((page, index) => (
          <li key={page.id} data-testid={`project-page-${page.id}`}>
            <span>{page.name ?? String(index + 1)}</span>{' '}
            <span className="projects__lede">
              {page.panels.length === 0
                ? t('projects.pages.noPanels')
                : tn('projects.pages.panelCount', page.panels.length)}
            </span>
            <button
              type="button"
              disabled={busy || index === 0}
              data-testid={`project-page-up-${page.id}`}
              onClick={() => run(movePage(projectId, volumeId, chapterId, page.id, index - 1))}
            >
              {t('projects.seasons.moveUp')}
            </button>
            <button
              type="button"
              disabled={busy || index === (pages ?? []).length - 1}
              data-testid={`project-page-down-${page.id}`}
              onClick={() => run(movePage(projectId, volumeId, chapterId, page.id, index + 1))}
            >
              {t('projects.seasons.moveDown')}
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid={`project-page-delete-${page.id}`}
              onClick={() => run(deletePage(projectId, volumeId, chapterId, page.id))}
            >
              {t('projects.pages.delete')}
            </button>
            <ol data-testid={`project-panels-${page.id}`}>
              {page.panels.map((panel, place) => (
                <li key={panel.id} data-testid={`project-panel-${panel.id}`}>
                  <span>{panel.description ?? ''}</span>
                  {panel.dialogue ? <blockquote>{panel.dialogue}</blockquote> : null}
                  <span className="projects__lede">
                    {t('projects.pages.shows')}:{' '}
                    {panel.canonEntityId && panel.canonEntityName ? (
                      // A usable way through to the entry, which is where its picture is served from: the Media
                      // feature draws it on the entry's own screen, and this points at that rather than copying it.
                      <Link
                        to={`/app/universes/${universeId}/lore/${panel.canonEntityId}`}
                        data-testid={`project-panel-shows-${panel.id}`}
                      >
                        {panel.canonEntityName}
                      </Link>
                    ) : (
                      t('projects.pages.showsNone')
                    )}
                  </span>

                  <PanelLore
                    universeId={universeId}
                    panelId={panel.id}
                    chosen={
                      panel.canonEntityId && panel.canonEntityName
                        ? { id: panel.canonEntityId, name: panel.canonEntityName }
                        : null
                    }
                    busy={busy}
                    onChange={(choice) =>
                      run(
                        savePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                          description: panel.description,
                          dialogue: panel.dialogue,
                          canonEntityId: choice?.id ?? null,
                        }),
                      )
                    }
                  />

                  <button
                    type="button"
                    disabled={busy || place === 0}
                    data-testid={`project-panel-up-${panel.id}`}
                    onClick={() =>
                      run(
                        movePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                          place: place - 1,
                        }),
                      )
                    }
                  >
                    {t('projects.seasons.moveUp')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || place === page.panels.length - 1}
                    data-testid={`project-panel-down-${panel.id}`}
                    onClick={() =>
                      run(
                        movePanel(projectId, volumeId, chapterId, page.id, panel.id, {
                          place: place + 1,
                        }),
                      )
                    }
                  >
                    {t('projects.seasons.moveDown')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid={`project-panel-delete-${panel.id}`}
                    onClick={() =>
                      run(deletePanel(projectId, volumeId, chapterId, page.id, panel.id))
                    }
                  >
                    {t('projects.pages.deletePanel')}
                  </button>
                </li>
              ))}
            </ol>
            {addingTo === page.id ? (
              <PanelForm
                busy={busy}
                universeId={universeId}
                onCancel={() => setAddingTo(null)}
                onSubmit={(description, dialogue, canonEntityId) => {
                  setBusy(true)
                  createPanel(projectId, volumeId, chapterId, page.id, {
                    description,
                    dialogue,
                    canonEntityId,
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
                data-testid={`project-panel-add-${page.id}`}
                onClick={() => setAddingTo(page.id)}
              >
                {t('projects.pages.addPanel')}
              </button>
            )}
          </li>
        ))}
      </ol>

      <form
        className="form"
        data-testid={`project-page-new-${chapterId}`}
        onSubmit={(event) => {
          event.preventDefault()
          if (busy) return
          setBusy(true)
          createPage(projectId, volumeId, chapterId, {
            name: name.length > 0 ? name : null,
            notes: null,
          })
            .then(() => {
              setName('')
              return refresh()
            })
            .catch(failing)
        }}
      >
        <label className="field">
          <span className="field__label">{t('projects.pages.name')}</span>
          <input
            className="field__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('projects.pages.namePlaceholder')}
            data-testid={`project-page-new-name-${chapterId}`}
          />
        </label>
        <button type="submit" disabled={busy} data-testid={`project-page-new-save-${chapterId}`}>
          {t('projects.pages.save')}
        </button>
      </form>
    </section>
  )
}

function PanelForm({
  busy,
  universeId,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  universeId: string
  onSubmit: (
    description: string | null,
    dialogue: string | null,
    canonEntityId: string | null,
  ) => void
  onCancel: () => void
}) {
  useI18n()
  const [description, setDescription] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [shows, setShows] = useState<{ id: string; name: string } | null>(null)

  return (
    <form
      className="form"
      data-testid="project-panel-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit(
          description.length > 0 ? description : null,
          dialogue.length > 0 ? dialogue : null,
          shows?.id ?? null,
        )
      }}
    >
      <label className="field">
        <span className="field__label">{t('projects.pages.description')}</span>
        <input
          className="field__input"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('projects.pages.descriptionPlaceholder')}
          data-testid="project-panel-new-description"
        />
      </label>
      <label className="field">
        <span className="field__label">{t('projects.pages.dialogue')}</span>
        <textarea
          className="field__input"
          value={dialogue}
          onChange={(event) => setDialogue(event.target.value)}
          placeholder={t('projects.pages.dialoguePlaceholder')}
          data-testid="project-panel-new-dialogue"
        />
      </label>
      {/* The lore entry this panel shows, chosen with the picker the rest of LorEvolve uses. Optional: a panel of
          scenery names nothing. */}
      <div data-testid="project-panel-new-shows">
        <EntityPicker
          label={t('projects.pages.shows')}
          universeId={universeId}
          value={shows}
          onChange={(choice) => setShows(choice ? { id: choice.id, name: choice.name } : null)}
        />
      </div>

      <button type="submit" disabled={busy} data-testid="project-panel-new-save">
        {t('projects.pages.savePanel')}
      </button>
      <button type="button" onClick={onCancel} data-testid="project-panel-new-cancel">
        {t('projects.pages.close')}
      </button>
    </form>
  )
}

/**
 * Changes which lore entry a panel shows, with the same picker the rest of LorEvolve uses, so the search, the
 * keyboard handling and the same-universe scoping are the ones an author already knows. The API checks the entry is a
 * live lore entry of this universe as well; this is the way in, not the guarantee.
 */
function PanelLore({
  universeId,
  panelId,
  chosen,
  busy,
  onChange,
}: {
  universeId: string
  panelId: string
  chosen: { id: string; name: string } | null
  busy: boolean
  onChange: (choice: { id: string; name: string } | null) => void
}) {
  useI18n()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        disabled={busy}
        data-testid={`project-panel-shows-change-${panelId}`}
        onClick={() => setOpen(true)}
      >
        {chosen ? t('projects.pages.changeShows') : t('projects.pages.chooseShows')}
      </button>
    )
  }

  return (
    <div data-testid={`project-panel-shows-picker-${panelId}`}>
      <EntityPicker
        label={t('projects.pages.shows')}
        universeId={universeId}
        value={chosen}
        onChange={(choice) => {
          setOpen(false)
          onChange(choice ? { id: choice.id, name: choice.name } : null)
        }}
      />
      <button
        type="button"
        data-testid={`project-panel-shows-cancel-${panelId}`}
        onClick={() => setOpen(false)}
      >
        {t('projects.pages.close')}
      </button>
    </div>
  )
}
