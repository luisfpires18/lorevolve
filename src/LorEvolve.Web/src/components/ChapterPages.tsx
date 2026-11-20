import { useCallback, useState } from 'react'
import { Field } from './Field'
import { createPage, listPages } from '../projectEntities/pages'
import { t, useI18n } from '../i18n'
import { PageRow } from './projectEntities/PageRow'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { NewButton } from './NewButton'
import { ProjectCard } from './ProjectCard'
import { useLoadedList } from '../lib/useLoadedList'
import { useDiscardGuard } from '../lib/useDiscardGuard'

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
  const [name, setName] = useState('')
  const [addingPage, setAddingPage] = useState(false)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const read = useCallback(
    (signal?: AbortSignal) => listPages(projectId, volumeId, chapterId, signal),
    [projectId, volumeId, chapterId],
  )
  const {
    data: pages,
    failed,
    busy,
    setBusy,
    refresh,
    failing,
    run,
  } = useLoadedList(read, t('projects.pages.failed'), { enabled: open, emptyOnFail: [] })
  const { confirmLeave } = useDiscardGuard(
    open && addingPage && name !== '' && !busy,
    t('projects.pages.leave'),
  )

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
    <ProjectCard
      as="section"
      plain
      level={4}
      titleClassName="sectionrule sectionrule--accent"
      testId={`chapter-pages-${chapterId}`}
      title={t('projects.pages.title')}
      actions={
        <>
          <NewButton
            tone="secondary"
            size="sm"
            aria-expanded={addingPage}
            data-testid={`chapter-page-add-${chapterId}`}
            onClick={() => setAddingPage((isOpen) => !isOpen)}
          >
            {t('projects.pages.add')}
          </NewButton>
          <Button
            tone="secondary"
            size="sm"
            data-testid={`chapter-pages-close-${chapterId}`}
            onClick={() => setOpen(false)}
          >
            {t('projects.pages.close')}
          </Button>
        </>
      }
    >
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
          <FormActions
            submitLabel={t('projects.pages.add')}
            disabled={busy}
            submitTestId={`project-page-new-save-${chapterId}`}
            onCancel={() =>
              void confirmLeave().then((ok) => {
                if (!ok) return
                setName('')
                setAddingPage(false)
              })
            }
            cancelTestId={`project-page-new-cancel-${chapterId}`}
            inline
          />
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
    </ProjectCard>
  )
}
