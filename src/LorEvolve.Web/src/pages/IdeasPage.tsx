import { useId } from 'react'
import { useOutletContext } from 'react-router-dom'
import { IdeasHeader } from '../components/ideas/IdeasHeader'
import { IdeasTabs } from '../components/IdeasTabs'
import { Quoted } from '../components/NameList'
import { NewButton } from '../components/NewButton'
import { PageHeader } from '../components/PageHeader'
import { QuickCapture } from '../components/ideas/QuickCapture'
import { RecordListPage } from '../components/ideas/RecordListPage'
import { RecordRow } from '../components/ideas/RecordRow'
import { listIdeas, restoreIdea } from '../ideas/api'
import { listIdeaBoards, restoreIdeaBoard } from '../ideas/boards'
import type { IdeasScope } from '../ideas/types'
import { t, tn, tx, useI18n } from '../i18n'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * A list of ideas: every idea the account has, one universe's, or one story's (`IdeasScope`). Most recently updated
 * first, so nothing has to be organised. Globally, the Show filter narrows to unassigned ideas or to one universe's,
 * and each row says which in words. Inside a story, the universe's ideas that reference the story or something in it.
 * Every way, Recently deleted lists the ideas deleted from the same place, with Restore, and the live list opens with a
 * one-line capture. An idea always opens in the one editor, at its universe's address or the account's.
 */
function IdeasList({ scope }: { scope: IdeasScope }) {
  const headingId = useId()
  const universe = scope.kind === 'all' ? null : scope.universe
  // Where an idea opens, and a new one starts. A story's ideas open in their universe's editor: Back returns here.
  const basePath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'
  // A story's and a project's ideas are views inside a page that has its own header and tabs.
  const nested = scope.kind === 'story' || scope.kind === 'project' ? scope.kind : null

  return (
    <RecordListPage
      testId="ideas"
      className={`ideas ideas--${scope.kind}`}
      words="ideas.browser"
      universe={universe}
      basePath={basePath}
      headingId={headingId}
      header={
        <IdeasHeader
          isNested={nested !== null}
          headingId={headingId}
          scope={scope}
          universe={universe}
          basePath={basePath}
        />
      }
      capture={(onCaptured) => <QuickCapture scope={scope} onCaptured={onCaptured} />}
      storyId={scope.kind === 'story' ? scope.story.id : null}
      projectId={scope.kind === 'project' ? scope.project.id : null}
      read={listIdeas}
      restoreRecord={restoreIdea}
      restored={(idea) => ({
        text: idea.universe
          ? tx('ideas.browser.restoredIn', {
              title: <Quoted text={idea.title} />,
              universe: <Quoted text={idea.universe.name} />,
            })
          : tx('ideas.browser.restored', { title: <Quoted text={idea.title} /> }),
        link: {
          to: `${basePath}/${idea.id}`,
          label: tx('ideas.browser.open', { title: <Quoted text={idea.title} /> }),
        },
      })}
      follow
      allLabel={t('ideas.browser.allIdeas')}
      strayOption
      listTestId="idea-list"
      renderRow={(idea, row) => (
        <RecordRow
          key={idea.id}
          record={idea}
          testIdPrefix="idea"
          words="ideas.browser"
          {...row}
          basePath={basePath}
          universe={universe}
          seal
          excerpt={
            idea.excerpt ? (
              <>
                {idea.excerpt}
                {idea.isExcerptShortened ? '…' : null}
              </>
            ) : null
          }
          count={
            idea.referenceCount > 0 ? (
              <span>
                {tn('ideas.browser.references', idea.referenceCount, { n: idea.referenceCount })}
              </span>
            ) : null
          }
        />
      )}
      emptyScope={nested}
      newLabel={t('ideas.browser.newIdea')}
      newTestId="empty-new-idea"
      restoredLinkTestId="ideas-open-restored"
    />
  )
}

/** The idea boards (ADR 0066): every board of the account, or one universe's, most recently updated first. */
function BoardsList({ universe }: { universe: { id: string; name: string } | null }) {
  const headingId = useId()
  const ideasPath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'
  const basePath = `${ideasPath}/boards`

  return (
    <RecordListPage
      testId="boards"
      className="ideas"
      words="ideas.boards"
      universe={universe}
      basePath={basePath}
      headingId={headingId}
      header={
        <>
          <PageHeader
            title={t('ideas.boards.title')}
            titleId={headingId}
            lede={
              <p className="ideas__lede">
                {universe
                  ? tx('ideas.boards.ledeUniverse', { universe: <Quoted text={universe.name} /> })
                  : t('ideas.boards.ledeAll')}
              </p>
            }
            actions={
              <NewButton to={`${basePath}/new`} data-testid="new-board">
                {t('ideas.boards.newBoard')}
              </NewButton>
            }
          />

          <IdeasTabs basePath={ideasPath} current="boards" />
        </>
      }
      read={listIdeaBoards}
      restoreRecord={restoreIdeaBoard}
      restored={(board) => ({
        text: tx('ideas.boards.restored', { title: <Quoted text={board.title} /> }),
        link: { to: `${basePath}/${board.id}`, label: t('ideas.boards.openIt') },
      })}
      follow={false}
      allLabel={t('ideas.boards.allBoards')}
      strayOption={false}
      listTestId="board-rows"
      renderRow={(board, row) => (
        <RecordRow
          key={board.id}
          record={board}
          testIdPrefix="board"
          words="ideas.boards"
          {...row}
          basePath={basePath}
          universe={universe}
          count={<span>{tn('ideas.boards.cards', board.cardCount)}</span>}
          countFirst
        />
      )}
      newLabel={t('ideas.boards.newBoard')}
      newTestId="empty-new-board"
    />
  )
}

/**
 * Ideas: every idea the account has at `/app/ideas`, or one universe's inside its workspace. One list either way, not
 * two idea systems. `boards` is the idea boards list at `ideas/boards`, the same list part with the boards' words.
 */
export default function IdeasPage({
  inUniverse = false,
  boards = false,
}: {
  inUniverse?: boolean
  boards?: boolean
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const context = useOutletContext<WorkspaceContext | undefined>()
  const universe = inUniverse && context ? context.universe : null
  const named = universe ? { id: universe.id, name: universe.name } : null

  if (boards) return <BoardsList universe={named} />
  return <IdeasList scope={named ? { kind: 'universe', universe: named } : { kind: 'all' }} />
}
