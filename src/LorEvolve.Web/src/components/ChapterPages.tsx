import { useEffect, useState } from 'react'
import { Field } from './Field'
import { createPage, listPages, type ProjectPage } from '../projectEntities/pages'
import { t, useI18n } from '../i18n'
import { PageRow } from './projectEntities/PageRow'
import { Button } from './Button'

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
  const [addingPage, setAddingPage] = useState(false)
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
      <Button
        tone="secondary"
        size="sm"
        data-testid={`chapter-pages-open-${chapterId}`}
        onClick={() => setOpen(true)}
      >
        {t('projects.pages.open')}
      </Button>
    )
  }

  return (
    <section data-testid={`chapter-pages-${chapterId}`}>
      <div className="projectcard__head">
        <h4 className="sectionrule sectionrule--accent">{t('projects.pages.title')}</h4>
        <div className="projectcard__actions">
          <Button
            size="sm"
            aria-expanded={addingPage}
            data-testid={`chapter-page-add-${chapterId}`}
            onClick={() => setAddingPage((isOpen) => !isOpen)}
          >
            {t('projects.pages.add')}
          </Button>
          <Button
            tone="secondary"
            size="sm"
            data-testid={`chapter-pages-close-${chapterId}`}
            onClick={() => setOpen(false)}
          >
            {t('projects.pages.close')}
          </Button>
        </div>
      </div>

      {failed ? (
        <p className="form__message" role="alert" data-testid={`chapter-pages-failed-${chapterId}`}>
          {failed}
        </p>
      ) : null}

      {pages === null ? <p className="projectcard__meta">{t('projects.common.loading')}</p> : null}

      {/* The page form opens from the head above, rather than sitting open under every chapter an author expands. */}
      {addingPage ? (
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
                setAddingPage(false)
                return refresh()
              })
              .catch(failing)
          }}
        >
          <Field label={t('projects.pages.name')}>
            {(control) => (
              <input
                {...control}
                className="field__input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('projects.pages.namePlaceholder')}
                data-testid={`project-page-new-name-${chapterId}`}
              />
            )}
          </Field>
          <div className="form__actions">
            <Button
              type="submit"
              disabled={busy}
              data-testid={`project-page-new-save-${chapterId}`}
            >
              {t('projects.pages.add')}
            </Button>
            <Button
              tone="secondary"
              onClick={() => setAddingPage(false)}
              data-testid={`project-page-new-cancel-${chapterId}`}
            >
              {t('projects.common.cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      {pages !== null && pages.length === 0 ? (
        <p className="projectcard__meta">{t('projects.pages.empty')}</p>
      ) : null}

      <ol className="fieldlist" data-testid={`chapter-page-list-${chapterId}`}>
        {(pages ?? []).map((page, index) => (
          <PageRow
            key={page.id}
            projectId={projectId}
            universeId={universeId}
            volumeId={volumeId}
            chapterId={chapterId}
            pages={pages}
            page={page}
            index={index}
            busy={busy}
            setBusy={setBusy}
            run={run}
            refresh={refresh}
            failing={failing}
            addingTo={addingTo}
            setAddingTo={setAddingTo}
          />
        ))}
      </ol>
    </section>
  )
}
