import { useCallback, useState } from 'react'
import { createPage, listPages } from '../projectEntities/pages'
import { t, useI18n } from '../i18n'
import { PageRow } from './projectEntities/PageRow'
import { Button } from './Button'
import { NameSummaryDrawer } from './NameSummaryDrawer'
import { PageHeader } from './PageHeader'
import { NewButton } from './NewButton'
import { useLoadedList } from '../lib/useLoadedList'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

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
    refresh,
    run,
  } = useLoadedList(read, t('projects.pages.failed'), { enabled: open, emptyOnFail: [] })

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
      <PageHeader
        level={3}
        size="panel"
        accent
        title={t('projects.pages.title')}
        actions={
          <>
            <NewButton
              tone="secondary"
              size="sm"
              data-testid={`chapter-page-add-${chapterId}`}
              onClick={() => setAddingPage(true)}
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
      />

      {failed ? (
        <FormMessage testId={`chapter-pages-failed-${chapterId}`}>{failed}</FormMessage>
      ) : null}

      {pages === null ? (
        <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
      ) : null}

      {/* The page drawer opens from the head above, rather than a form open under every chapter an author expands. */}
      {addingPage ? (
        <NameSummaryDrawer
          testId={`project-page-new-${chapterId}`}
          partTestId={(part) => `project-page-new-${part}-${chapterId}`}
          eyebrow={t('projects.pages.title')}
          title={t('projects.pages.add')}
          initial={null}
          nameOptional
          busy={busy}
          words={{
            save: t('projects.pages.add'),
            name: t('projects.pages.name'),
            leave: t('projects.pages.leave'),
            failed: t('projects.pages.failed'),
          }}
          onClose={() => setAddingPage(false)}
          onSave={(input) =>
            createPage(projectId, volumeId, chapterId, {
              name: input.name.length > 0 ? input.name : null,
              notes: null,
            })
              .then(refresh)
              .then(() => setAddingPage(false))
          }
        />
      ) : null}

      {pages !== null && pages.length === 0 ? (
        <QuietNote spacing="flush">{t('projects.pages.empty')}</QuietNote>
      ) : null}

      {pages !== null && pages.length > 0 ? (
        <ol className="types__list" data-testid={`chapter-page-list-${chapterId}`}>
          {pages.map((page, index) => (
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
              run={run}
              refresh={refresh}
              addingTo={addingTo}
              setAddingTo={setAddingTo}
            />
          ))}
        </ol>
      ) : null}
    </section>
  )
}
