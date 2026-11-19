import { useId } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Quoted } from './NameList'
import { IdeaRow } from './ideas/IdeaRow'
import { IdeasControls } from './ideas/IdeasControls'
import { IdeasEmpty } from './ideas/IdeasEmpty'
import { IdeasHeader } from './ideas/IdeasHeader'
import { IdeasPager } from './ideas/IdeasPager'
import { QuickCapture } from './ideas/QuickCapture'
import type { IdeasScope } from '../ideas/types'
import { useIdeasActions } from '../ideas/useIdeasActions'
import { useIdeasFilters } from '../ideas/useIdeasFilters'
import { useIdeasRead } from '../ideas/useIdeasRead'
import { useIdeasState } from '../ideas/useIdeasState'
import { useI18n } from '../i18n'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'
import { OutcomeNotice } from './OutcomeNotice'

/** What an idea's editor says it did before handing back to the list. */
export interface IdeasListNotice {
  deleted?: { id: string; title: string }
  created?: { id: string; title: string }
}

/**
 * A list of ideas: every idea the account has, one universe's, or one story's (`IdeasScope`). Most recently updated
 * first, so nothing has to be organised. The filter is where the list is kept - in the address - so Back, Forward and a
 * reload keep it.
 *
 * Globally, the Show filter narrows to unassigned ideas or to one universe's, and each row says which in words: "No
 * universe", or the universe's name. Inside a universe the list is that universe's ideas, and inside a story the
 * universe's ideas that reference the story or something in it. Every way, Recently deleted lists the ideas deleted from
 * the same place, with Restore, and the live list opens with a one-line capture. An idea always opens in the one editor,
 * at its universe's address or the account's.
 */
export function IdeasBrowser({ scope }: { scope: IdeasScope }) {
  const { t, tx } = useI18n()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()
  const searchId = useId()
  const showId = useId()

  const universe = scope.kind === 'all' ? null : scope.universe
  const storyId = scope.kind === 'story' ? scope.story.id : null
  const projectId = scope.kind === 'project' ? scope.project.id : null
  // A story's and a project's ideas are views inside a page that has its own header and tabs.
  const isNested = scope.kind === 'story' || scope.kind === 'project'
  // Where an idea opens, and a new one starts. A story's ideas open in their universe's editor: Back returns here.
  const basePath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'

  const view = params.get('view') === 'deleted' ? 'deleted' : 'live'
  const show = universe ? universe.id : (params.get('show') ?? '')
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const base = useIdeasState(search)
  const { typed, setTyped, state, setState, setReads, universes, restoring, outcome, outcomeRef } =
    base

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as IdeasListNotice | null)?.deleted ?? null
  // A creation reported the same way: the new idea is in the list below.
  const created = (location.state as IdeasListNotice | null)?.created ?? null

  const { update } = useIdeasFilters({ ...base, setParams, search })
  useIdeasRead({ ...base, universe, show, storyId, projectId, view, search, page, t })
  const { restore, captured } = useIdeasActions({ ...base, tx, basePath, page, update })

  const result = state.kind === 'ready' ? state.value : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')
  const deleted = view === 'deleted'

  return (
    <section
      className={`ideas ideas--${scope.kind}`}
      aria-labelledby={headingId}
      data-testid="ideas"
    >
      <IdeasHeader
        isNested={isNested}
        headingId={headingId}
        scope={scope}
        universe={universe}
        basePath={basePath}
      />

      {deleted ? null : <QuickCapture scope={scope} onCaptured={captured} />}

      {created && !deleted ? (
        <OutcomeNotice className="ideas__notice" testId="ideas-created-notice">
          {tx('ideas.browser.created', { title: <Quoted text={created.title} /> })}
        </OutcomeNotice>
      ) : null}

      {notice && !deleted ? (
        <OutcomeNotice className="ideas__notice" testId="ideas-deleted-notice">
          {tx('ideas.browser.deletedNotice', { title: <Quoted text={notice.title} /> })}
        </OutcomeNotice>
      ) : null}

      <IdeasControls
        searchId={searchId}
        showId={showId}
        typed={typed}
        setTyped={setTyped}
        universe={universe}
        show={show}
        update={update}
        universes={universes}
        deleted={deleted}
      />

      {outcome ? (
        <div className="notice ideas__outcome" ref={outcomeRef} tabIndex={-1}>
          <p role="status" data-testid="ideas-message">
            {outcome.text}
          </p>
          {outcome.link ? (
            <Link to={outcome.link.to} data-testid="ideas-open-restored">
              {outcome.link.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      {state.kind === 'loading' ? <LoadingNote>{t('ideas.browser.loading')}</LoadingNote> : null}

      {state.kind === 'error' ? (
        <LoadError
          message={state.message}
          onRetry={() => {
            setState({ kind: 'loading' })
            setReads((current) => current + 1)
          }}
          retryLabel={t('ideas.browser.retry')}
          testId="ideas-load-error"
        />
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="idealist" data-testid="idea-list">
          {result.items.map((idea) => (
            <IdeaRow
              key={idea.id}
              idea={idea}
              deleted={deleted}
              basePath={basePath}
              universe={universe}
              restoring={restoring}
              restore={restore}
            />
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <IdeasEmpty deleted={deleted} isFiltered={isFiltered} scope={scope} basePath={basePath} />
      ) : null}

      {result && result.totalPages > 1 ? <IdeasPager result={result} update={update} /> : null}
    </section>
  )
}
