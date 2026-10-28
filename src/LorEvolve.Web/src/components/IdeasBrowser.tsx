import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Plus } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import { IdeasTabs } from './IdeasTabs'
import { ActionIcon } from './ActionIcon'
import { PageHeader } from './PageHeader'
import { Quoted } from './NameList'
import { createIdea, listAllUniverses, listIdeas, restoreIdea } from '../ideas/api'
import {
  IDEA_TITLE_MAX_LENGTH,
  IdeaReferenceKind,
  type IdeaInput,
  type IdeaPage,
  type IdeaSummary,
  type IdeasScope,
} from '../ideas/types'
import { ApiError } from '../lib/api'
import { formatDate, formatDateTime } from '../lib/dates'
import type { UniverseSummary } from '../universes/types'

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; page: IdeaPage } | { kind: 'error'; message: string }

/** What the last restore did, and the way to the idea it brought back. */
interface Outcome {
  text: ReactNode
  link: { to: string; label: ReactNode } | null
}

/** What an idea's editor says it did before handing back to the list. */
export interface IdeasListNotice {
  deleted?: { id: string; title: string }
  created?: { id: string; title: string }
}

/** The value of the Show filter that means ideas in no universe. Never a universe id. */
const UNASSIGNED = 'unassigned'

/**
 * What a capture creates from where it was typed: no universe from all ideas, the universe from a universe's, and the
 * universe plus one reference to the story from a story's - which is what puts it in that story's list.
 */
function captureInput(scope: IdeasScope, title: string): IdeaInput {
  return {
    title,
    body: '',
    universeId: scope.kind === 'all' ? null : scope.universe.id,
    references:
      scope.kind === 'story' ? [{ kind: IdeaReferenceKind.Story, id: scope.story.id }] : [],
    expectedUpdatedAt: null,
  }
}

function referenceCountLabel(total: number) {
  return total === 1 ? '1 reference' : `${total} references`
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
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const headingId = useId()
  const searchId = useId()
  const showId = useId()

  const universe = scope.kind === 'all' ? null : scope.universe
  const storyId = scope.kind === 'story' ? scope.story.id : null
  // Where an idea opens, and a new one starts. A story's ideas open in their universe's editor: Back returns here.
  const basePath = universe ? `/app/universes/${universe.id}/ideas` : '/app/ideas'

  const view = params.get('view') === 'deleted' ? 'deleted' : 'live'
  const show = universe ? universe.id : (params.get('show') ?? '')
  const search = params.get('q') ?? ''
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const [typed, setTyped] = useState(search)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [reads, setReads] = useState(0)
  const [universes, setUniverses] = useState<UniverseSummary[] | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const outcomeRef = useRef<HTMLDivElement>(null)

  // A deletion reported by the editor that sent the author here.
  const notice = (location.state as IdeasListNotice | null)?.deleted ?? null
  // A creation reported the same way: the new idea is in the list below.
  const created = (location.state as IdeasListNotice | null)?.created ?? null

  /** Writes filters into the address, dropping empty ones, and starts from the first page unless told otherwise. */
  const update = useCallback(
    (change: Record<string, string | null>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(change)) {
            if (value === null || value === '') next.delete(key)
            else next.set(key, value)
          }
          if (!('page' in change)) next.delete('page')
          return next
        },
        // Typing is one filter being written, not a history entry per pause.
        { replace: 'q' in change },
      )
    },
    [setParams],
  )

  // The box follows the address when the address moves on its own - Back, Forward, a link - and never overwrites what is
  // being typed with the filter it just wrote.
  const written = useRef(search)
  useEffect(() => {
    if (search !== written.current) setTyped(search)
    written.current = search
  }, [search])

  // Typing settles before the address - and so the request - changes.
  useEffect(() => {
    if (typed === search) return
    const timer = setTimeout(() => {
      const next = typed.trim() === '' ? '' : typed
      written.current = next
      update({ q: next })
    }, 200)
    return () => {
      clearTimeout(timer)
    }
  }, [typed, search, update])

  useEffect(() => {
    if (universe) return
    const controller = new AbortController()
    listAllUniverses(controller.signal)
      .then(setUniverses)
      .catch(() => {
        if (!controller.signal.aborted) setUniverses(null)
      })
    return () => {
      controller.abort()
    }
  }, [universe])

  useEffect(() => {
    const controller = new AbortController()

    listIdeas(
      {
        universeId: show !== '' && show !== UNASSIGNED ? show : null,
        storyId,
        unassigned: show === UNASSIGNED,
        deleted: view === 'deleted',
        search,
        page,
      },
      controller.signal,
    )
      .then((result) => setState({ kind: 'ready', page: result }))
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ kind: 'error', message: 'The ideas could not be read.' })
      })

    return () => {
      controller.abort()
    }
  }, [show, storyId, view, search, page, reads])

  useEffect(() => {
    if (outcome) outcomeRef.current?.focus()
  }, [outcome])

  async function restore(idea: IdeaSummary) {
    setRestoring(idea.id)
    setOutcome(null)
    try {
      const restored = await restoreIdea(idea.id)
      setOutcome({
        text: restored.universe ? (
          <>
            <Quoted text={restored.title} /> is back in your ideas, in{' '}
            <Quoted text={restored.universe.name} />.
          </>
        ) : (
          <>
            <Quoted text={restored.title} /> is back in your ideas.
          </>
        ),
        link: {
          to: `${basePath}/${restored.id}`,
          label: (
            <>
              Open <Quoted text={restored.title} />
            </>
          ),
        },
      })
    } catch {
      setOutcome({
        text: (
          <>
            <Quoted text={idea.title} /> could not be restored. Try again.
          </>
        ),
        link: null,
      })
    } finally {
      setRestoring(null)
      setReads((current) => current + 1)
    }
  }

  /** A captured idea is the newest: shown at the top of the first page, which is read again. */
  const captured = useCallback(() => {
    setOutcome(null)
    if (page !== 1) update({ page: null })
    setReads((current) => current + 1)
  }, [page, update])

  const result = state.kind === 'ready' ? state.page : null
  const isFiltered = search.trim() !== '' || (!universe && show !== '')
  const deleted = view === 'deleted'

  const allLink = universe ? (
    <p className="ideas__all">
      <Link to="/app/ideas" data-testid="ideas-all">
        All your ideas
      </Link>
    </p>
  ) : null

  return (
    <section
      className={`ideas ideas--${scope.kind}`}
      aria-labelledby={headingId}
      data-testid="ideas"
    >
      {scope.kind === 'story' ? (
        // Inside a story the story's own header is the page's: this is one of its views, named for a screen reader.
        <div className="ideas__intro">
          <h2 className="visually-hidden" id={headingId}>
            Ideas
          </h2>
          <p className="ideas__lede">
            Ideas linked to this story or to one of its scenes, arcs or beats. Only you can see
            them.
          </p>
          {allLink}
        </div>
      ) : (
        <PageHeader
          title="Ideas"
          titleId={headingId}
          lede={
            <>
              <p className="ideas__lede">
                {universe ? (
                  <>
                    Your ideas for <Quoted text={universe.name} />. Only you can see them, and
                    nothing here changes the world.
                  </>
                ) : (
                  'Every idea you have, in a universe or not. Only you can see them, and they stay out of your lore.'
                )}
              </p>
              {allLink}
            </>
          }
          actions={
            <Link className="button" to={`${basePath}/new`} data-testid="new-idea">
              <ActionIcon icon={Plus} />
              New idea
            </Link>
          }
        />
      )}

      {scope.kind === 'story' ? null : <IdeasTabs basePath={basePath} current="ideas" />}

      {deleted ? null : <QuickCapture scope={scope} onCaptured={captured} />}

      {created && !deleted ? (
        <div className="notice ideas__notice" data-testid="ideas-created-notice">
          <p role="status">
            Created <Quoted text={created.title} />.
          </p>
        </div>
      ) : null}

      {notice && !deleted ? (
        <div className="notice ideas__notice" data-testid="ideas-deleted-notice">
          <p role="status">
            <Quoted text={notice.title} /> was deleted. It is in Recently deleted, where you can
            restore it.
          </p>
        </div>
      ) : null}

      <div className="controls ideas__controls">
        <div className="controls__search">
          <label className="field__label" htmlFor={searchId}>
            Filter ideas
          </label>
          <input
            id={searchId}
            className="field__input"
            type="search"
            placeholder="Words in a title or body"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="ideas-search"
          />
        </div>

        {universe ? null : (
          <div className="ideas__show">
            <label className="field__label" htmlFor={showId}>
              Show
            </label>
            <select
              id={showId}
              className="field__input field__input--select"
              value={show}
              onChange={(event) => update({ show: event.target.value })}
              data-testid="ideas-show"
            >
              <option value="">All ideas</option>
              <option value={UNASSIGNED}>No universe</option>
              {show !== '' && show !== UNASSIGNED && !universes?.some((one) => one.id === show) ? (
                <option value={show}>A universe</option>
              ) : null}
              {(universes ?? []).map((one) => (
                <option key={one.id} value={one.id}>
                  {one.isArchived ? `${one.name} (archived)` : one.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="segmented" role="group" aria-label="Which ideas">
          <button
            type="button"
            className="segmented__option"
            aria-pressed={!deleted}
            onClick={() => update({ view: null })}
            data-testid="ideas-view-live"
          >
            Ideas
          </button>
          <button
            type="button"
            className="segmented__option"
            aria-pressed={deleted}
            onClick={() => update({ view: 'deleted' })}
            data-testid="ideas-view-deleted"
          >
            Recently deleted
          </button>
        </div>
      </div>

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

      {state.kind === 'loading' ? (
        <p className="notice" role="status">
          Gathering ideas…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <div className="notice notice--error" role="alert" data-testid="ideas-load-error">
          <p>{state.message}</p>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setState({ kind: 'loading' })
              setReads((current) => current + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {result && result.items.length > 0 ? (
        <ul className="idealist" data-testid="idea-list">
          {result.items.map((idea) => (
            <li
              className={deleted ? 'idearow' : 'idearow rowlink'}
              key={idea.id}
              data-testid="idea-row"
              data-title={idea.title}
              data-universe={idea.universe?.name ?? ''}
            >
              <div className="idearow__main">
                {deleted ? (
                  <p className="idearow__title">
                    <bdi>{idea.title}</bdi>
                  </p>
                ) : (
                  <Link
                    className="idearow__title rowlink__target"
                    to={`${basePath}/${idea.id}`}
                    data-testid="idea-open"
                  >
                    <bdi>{idea.title}</bdi>
                  </Link>
                )}
                {idea.excerpt ? (
                  <p className="idearow__excerpt prose" data-testid="idea-excerpt">
                    {idea.excerpt}
                    {idea.isExcerptShortened ? '…' : null}
                  </p>
                ) : null}
                <p className="idearow__meta">
                  {universe ? null : idea.universe ? (
                    <span className="idearow__universe" data-testid="idea-universe-label">
                      <span
                        className="idearow__seal"
                        aria-hidden="true"
                        style={
                          idea.universe.accentColor
                            ? { background: idea.universe.accentColor }
                            : undefined
                        }
                      />
                      {idea.universe.name}
                    </span>
                  ) : (
                    <span
                      className="idearow__universe idearow__universe--none"
                      data-testid="idea-universe-label"
                    >
                      No universe
                    </span>
                  )}
                  {deleted && idea.deletedAt ? (
                    <span>
                      Deleted{' '}
                      <time dateTime={idea.deletedAt}>{formatDateTime(idea.deletedAt)}</time>
                    </span>
                  ) : (
                    <span>
                      Updated <time dateTime={idea.updatedAt}>{formatDate(idea.updatedAt)}</time>
                    </span>
                  )}
                  {idea.referenceCount > 0 ? (
                    <span>{referenceCountLabel(idea.referenceCount)}</span>
                  ) : null}
                </p>
              </div>
              {deleted ? (
                <button
                  className="button button--secondary idearow__restore"
                  type="button"
                  disabled={restoring !== null}
                  onClick={() => void restore(idea)}
                  aria-label={`Restore idea “${idea.title}”`}
                  data-testid="idea-restore"
                >
                  {restoring === idea.id ? 'Restoring…' : 'Restore'}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        deleted ? (
          <EmptyState
            testId="ideas-empty"
            title="Nothing recently deleted."
            hint="A deleted idea waits here, whole, until you restore it."
          />
        ) : isFiltered ? (
          <EmptyState
            testId="ideas-empty"
            title="No ideas match."
            hint="Try other words, or show all ideas."
          />
        ) : scope.kind === 'story' ? (
          <EmptyState
            testId="ideas-empty"
            title="No ideas for this story yet."
            hint="Capture one above. Ideas linked to any scene, arc or beat in it show up here too."
          />
        ) : (
          <EmptyState
            testId="ideas-empty"
            title="No ideas yet."
            hint="Keep possibilities here, apart from what is true in your world."
            action={
              <Link className="button" to={`${basePath}/new`} data-testid="empty-new-idea">
                <ActionIcon icon={Plus} />
                New idea
              </Link>
            }
          />
        )
      ) : null}

      {result && result.totalPages > 1 ? (
        <nav className="pager" aria-label="Pagination">
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page <= 1}
            onClick={() => update({ page: String(result.page - 1) })}
          >
            Previous
          </button>
          <span className="pager__position">
            Page {result.page} of {result.totalPages}
          </span>
          <button
            className="button button--secondary"
            type="button"
            disabled={result.page >= result.totalPages}
            onClick={() => update({ page: String(result.page + 1) })}
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  )
}

/**
 * One line, kept without leaving the list: the words become the title of a new idea with no body, placed by the list it
 * was typed in (`captureInput`). Enter keeps it, except while an input method is still composing. Kept words are cleared
 * and said so; refused ones stay in the box with the reason beside it. The full editor is one click away on the new row.
 */
function QuickCapture({ scope, onCaptured }: { scope: IdeasScope; onCaptured: () => void }) {
  const inputId = useId()
  const errorId = useId()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  // A second Enter before the first answer is the same idea, not another one.
  const inFlight = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    // A new attempt: what was said about the last one no longer applies.
    setSaid('')
    const title = text.trim()
    if (title === '') {
      setError('Write a few words first.')
      return
    }

    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const idea = await createIdea(captureInput(scope, title))
      setText('')
      // Ready for the next thought, even when the button was what kept this one.
      inputRef.current?.focus()
      setSaid(`Captured “${idea.title}”.`)
      onCaptured()
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 400
          ? caught.message
          : 'The idea could not be saved. Your words are still here. Try again.',
      )
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter that confirms a composition (Japanese, Chinese, Korean input) is not Enter that submits.
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault()
    }
  }

  return (
    <form
      className="ideacapture"
      onSubmit={(event) => void submit(event)}
      noValidate
      data-testid="idea-capture"
    >
      <label className="field__label" htmlFor={inputId}>
        Capture an idea
      </label>
      <div className="ideacapture__row">
        <input
          ref={inputRef}
          id={inputId}
          className="field__input ideacapture__input"
          name="title"
          type="text"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={IDEA_TITLE_MAX_LENGTH}
          placeholder="One line is enough…"
          value={text}
          readOnly={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => {
            setText(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={keyDown}
          data-testid="idea-capture-input"
        />
        <button
          className="button button--secondary ideacapture__submit"
          type="submit"
          disabled={saving}
          data-testid="idea-capture-submit"
        >
          <ActionIcon icon={Plus} />
          {saving ? 'Capturing…' : 'Capture'}
        </button>
      </div>
      {error ? (
        <p className="field__error" id={errorId} role="alert" data-testid="idea-capture-error">
          {error}
        </p>
      ) : null}
      {/* Always in the page, so what is said into it is announced. */}
      <p className="ideacapture__status" role="status" data-testid="idea-capture-status">
        {said}
      </p>
    </form>
  )
}
