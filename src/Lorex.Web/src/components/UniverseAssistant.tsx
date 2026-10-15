import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { MessageCircleQuestionMark } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import {
  askAssistant,
  getAssistantStatus,
  QUESTION_MAX_LENGTH,
  SOURCE_KIND_LABELS,
  sourcePath,
} from '../assistant/api'
import {
  AssistantRole,
  SegmentKind,
  type AssistantAnswer,
  type AssistantHistoryMessage,
  type SegmentKindValue,
} from '../assistant/types'
import { ApiError } from '../lib/api'
import { useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'

/** One question and what became of it. */
interface Turn {
  id: number
  question: string
  answer: AssistantAnswer | null
  error: string | null
}

type Availability = 'unknown' | 'available' | 'unavailable'

/** The word shown above each part of an answer. A note needs none. */
const PART_LABELS: Record<SegmentKindValue, string | null> = {
  [SegmentKind.Recorded]: 'Recorded',
  [SegmentKind.Inference]: 'Inference',
  [SegmentKind.Suggestion]: 'Suggestion',
  [SegmentKind.Note]: null,
}

const PART_CLASSES: Record<SegmentKindValue, string> = {
  [SegmentKind.Recorded]: 'recorded',
  [SegmentKind.Inference]: 'inference',
  [SegmentKind.Suggestion]: 'suggestion',
  [SegmentKind.Note]: 'note',
}

/** Starting points that need no AI call to show. The open-ended ones fill the box for the writer to finish. */
const PROMPTS = [
  { text: 'Summarize this universe', complete: true },
  { text: 'What is connected to ', complete: false },
  { text: 'Which scenes involve ', complete: false },
] as const

/** An answer as plain text, for the conversation the next question carries. */
function answerText(answer: AssistantAnswer) {
  return answer.segments
    .map((segment) => {
      const label = PART_LABELS[segment.kind]
      return label ? `(${label}) ${segment.text}` : segment.text
    })
    .join('\n\n')
}

/**
 * The universe assistant (ADR 0045): a button beside the universe's search, opening a drawer where a writer asks about
 * this universe and gets answers read from it, each part marked as recorded, inferred or suggested, with links back to
 * what it rests on.
 *
 * Nothing is asked of any model until a question is sent: opening the drawer reads only whether the assistant is set up.
 * The conversation lives here, for as long as the universe is open; a reload starts afresh and nothing is stored.
 * Closing the drawer, or following a link out of it, stops a question still being answered.
 */
export function UniverseAssistant({
  universeId,
  universeName,
}: {
  universeId: string
  universeName: string
}) {
  const location = useLocation()
  // Open for one address only: following a source (or any link) closes the drawer, as the phone's Sections sheet closes.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const isOpen = openAt === location.key
  const [availability, setAvailability] = useState<Availability>('unknown')
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<number | null>(null)
  const inFlight = useRef<AbortController | null>(null)
  const nextId = useRef(1)

  // A question still being answered when the drawer goes away is stopped; its words go back in the box.
  useEffect(() => {
    if (!isOpen) inFlight.current?.abort()
  }, [isOpen])

  useEffect(() => () => inFlight.current?.abort(), [])

  async function run(turnId: number, question: string, earlier: Turn[]) {
    const history: AssistantHistoryMessage[] = earlier.flatMap((turn) =>
      turn.answer
        ? [
            { role: AssistantRole.User, text: turn.question },
            { role: AssistantRole.Assistant, text: answerText(turn.answer) },
          ]
        : [],
    )

    const controller = new AbortController()
    inFlight.current = controller
    setPending(turnId)

    try {
      const answer = await askAssistant(universeId, question, history, controller.signal)
      setTurns((current) =>
        current.map((turn) => (turn.id === turnId ? { ...turn, answer, error: null } : turn)),
      )
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        setTurns((current) => current.filter((turn) => turn.id !== turnId))
        setDraft((current) => (current.trim() === '' ? question : current))
      } else {
        const message =
          error instanceof ApiError
            ? error.message
            : "The assistant couldn't answer that. Try again."
        if (error instanceof ApiError && error.code === 'assistant_unavailable') {
          setAvailability('unavailable')
        }
        setTurns((current) =>
          current.map((turn) => (turn.id === turnId ? { ...turn, error: message } : turn)),
        )
      }
    } finally {
      if (inFlight.current === controller) inFlight.current = null
      setPending((current) => (current === turnId ? null : current))
    }
  }

  function ask(question: string) {
    const text = question.trim()
    if (text === '' || pending !== null) return

    const turn: Turn = { id: nextId.current++, question: text, answer: null, error: null }
    const earlier = turns
    setTurns([...earlier, turn])
    setDraft('')
    void run(turn.id, text, earlier)
  }

  function retry(turn: Turn) {
    if (pending !== null) return
    setTurns((current) =>
      current.map((one) => (one.id === turn.id ? { ...one, error: null } : one)),
    )
    void run(
      turn.id,
      turn.question,
      turns.filter((one) => one.id < turn.id),
    )
  }

  return (
    <>
      <button
        className="button button--secondary assistanttrigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpenAt(location.key)}
        data-testid="assistant-trigger"
      >
        <ActionIcon icon={MessageCircleQuestionMark} />
        <span className="assistanttrigger__label">Assistant</span>
      </button>

      {isOpen ? (
        <AssistantDrawer
          universeId={universeId}
          universeName={universeName}
          availability={availability}
          onAvailability={setAvailability}
          turns={turns}
          pending={pending}
          draft={draft}
          onDraft={setDraft}
          onAsk={ask}
          onRetry={retry}
          onClose={() => setOpenAt(null)}
        />
      ) : null}
    </>
  )
}

interface DrawerProps {
  universeId: string
  universeName: string
  availability: Availability
  onAvailability: (next: Availability) => void
  turns: Turn[]
  pending: number | null
  draft: string
  onDraft: (next: string) => void
  onAsk: (question: string) => void
  onRetry: (turn: Turn) => void
  onClose: () => void
}

function AssistantDrawer({
  universeId,
  universeName,
  availability,
  onAvailability,
  turns,
  pending,
  draft,
  onDraft,
  onAsk,
  onRetry,
  onClose,
}: DrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const headingId = useId()
  const inputId = useId()
  const hintId = useId()
  // The question is kept by the button's owner, so closing loses nothing and there is nothing to ask about.
  const { close, dialogProps } = useDrawerGuard(false, '', onClose)

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    input.current?.focus()
  }, [])

  // Whether the assistant is set up, read once while the universe is open. Not a model call.
  useEffect(() => {
    if (availability !== 'unknown') return
    const controller = new AbortController()

    getAssistantStatus(universeId, controller.signal)
      .then((status) => onAvailability(status.isAvailable ? 'available' : 'unavailable'))
      .catch(() => {
        // Unknown stays unknown: the box stays open, and a question says what is wrong if anything is.
      })

    return () => controller.abort()
  }, [availability, onAvailability, universeId])

  // The newest turn in view as it arrives and as it is answered.
  const last = turns.at(-1)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, last?.answer, last?.error])

  const busy = pending !== null
  const announcement = busy ? `Looking through ${universeName}.` : last?.answer ? 'Answered.' : ''

  function submit(event?: FormEvent) {
    event?.preventDefault()
    onAsk(draft)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  function startWith(text: string, complete: boolean) {
    if (complete) {
      onAsk(text)
    } else {
      onDraft(text)
      input.current?.focus()
    }
  }

  return (
    <dialog
      className="drawer assistantdrawer"
      ref={dialog}
      aria-labelledby={headingId}
      {...dialogProps}
      data-testid="assistant-drawer"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">Assistant</p>
          <h2 className="drawer__title" id={headingId}>
            <bdi>{universeName}</bdi>
          </h2>
          <p className="drawer__context">It reads this universe and never changes it.</p>
        </header>

        <div className="drawer__body assistant__body">
          {availability === 'unavailable' ? (
            <p className="history__quiet" data-testid="assistant-unavailable">
              The assistant isn&rsquo;t set up on this LoreX yet. Everything else works as usual.
            </p>
          ) : turns.length === 0 ? (
            <div className="assistantempty" data-testid="assistant-empty">
              <p className="assistantempty__lead">
                Ask about anything recorded in <bdi>{universeName}</bdi>. Answers come only from
                what&rsquo;s written here.
              </p>
              <p className="assistantempty__hint">
                Each answer marks what&rsquo;s recorded, what&rsquo;s inferred and what&rsquo;s only
                a suggestion, and links back to where it comes from.
              </p>
              <ul className="assistantprompts" aria-label="Ways to start">
                {PROMPTS.map((prompt) => (
                  <li key={prompt.text}>
                    <button
                      className="assistantprompts__prompt"
                      type="button"
                      onClick={() => startWith(prompt.text, prompt.complete)}
                      data-testid="assistant-prompt"
                    >
                      {prompt.complete ? prompt.text : `${prompt.text.trim()}…`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="assistantturns" aria-label="Conversation">
              {turns.map((turn) => (
                <li className="assistantturn" key={turn.id} data-testid="assistant-turn">
                  <div className="assistantturn__question">
                    <p className="assistantturn__who">You</p>
                    <p className="assistantturn__text" dir="auto">
                      {turn.question}
                    </p>
                  </div>

                  {turn.answer ? (
                    <Answer universeId={universeId} answer={turn.answer} onFollow={onClose} />
                  ) : turn.error ? (
                    <div className="assistantturn__failure" data-testid="assistant-error">
                      <p role="alert">{turn.error}</p>
                      <button
                        className="button button--secondary button--sm"
                        type="button"
                        onClick={() => onRetry(turn)}
                        disabled={busy}
                        data-testid="assistant-retry"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <p className="assistantturn__pending" data-testid="assistant-pending">
                      Looking through <bdi>{universeName}</bdi>&hellip;
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div ref={end} />
          <p className="visually-hidden" role="status" data-testid="assistant-announcer">
            {announcement}
          </p>
        </div>

        <footer className="drawer__actions assistant__actions">
          {availability !== 'unavailable' ? (
            <form className="assistantform" onSubmit={submit}>
              <label className="field__label" htmlFor={inputId}>
                Your question
              </label>
              <textarea
                id={inputId}
                ref={input}
                className="field__input field__input--area assistantform__input"
                rows={2}
                dir="auto"
                maxLength={QUESTION_MAX_LENGTH}
                value={draft}
                onChange={(event) => onDraft(event.target.value)}
                onKeyDown={onKeyDown}
                aria-describedby={hintId}
                data-testid="assistant-input"
              />
              <p className="assistantform__hint" id={hintId}>
                Enter to ask, Shift+Enter for a new line.
              </p>
              <div className="assistant__buttons">
                <button
                  className="button"
                  type="submit"
                  disabled={busy || draft.trim() === ''}
                  data-testid="assistant-ask"
                >
                  {busy ? 'Asking' : 'Ask'}
                </button>
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={close}
                  data-testid="assistant-close"
                >
                  Close
                </button>
              </div>
            </form>
          ) : (
            <div className="assistant__buttons">
              <button
                className="button button--secondary"
                type="button"
                onClick={close}
                data-testid="assistant-close"
              >
                Close
              </button>
            </div>
          )}
        </footer>
      </div>
    </dialog>
  )
}

/** One answer: its parts, each marked with what it is, then the sources it cites. */
function Answer({
  universeId,
  answer,
  onFollow,
}: {
  universeId: string
  answer: AssistantAnswer
  onFollow: () => void
}) {
  const sourcesId = useId()

  return (
    <div className="assistantanswer" data-testid="assistant-answer">
      {answer.segments.map((segment, index) => {
        const label = PART_LABELS[segment.kind]
        return (
          <div
            className={`assistantpart assistantpart--${PART_CLASSES[segment.kind]}`}
            key={index}
            data-testid="assistant-part"
            data-kind={PART_CLASSES[segment.kind]}
          >
            {label ? <p className="assistantpart__label">{label}</p> : null}
            <p className="assistantpart__text" dir="auto">
              {segment.text}
            </p>
          </div>
        )
      })}

      {answer.isIncomplete ? (
        <p className="assistantanswer__incomplete">
          I stopped before reading everything that might matter. A narrower question may get a
          fuller answer.
        </p>
      ) : null}

      {answer.sources.length > 0 ? (
        <div className="assistantsources">
          <p className="assistantsources__title" id={sourcesId}>
            Sources
          </p>
          <ul className="assistantsources__list" aria-labelledby={sourcesId}>
            {answer.sources.map((source) => (
              <li key={source.id}>
                <Link
                  className="assistantsources__link"
                  to={sourcePath(universeId, source)}
                  onClick={onFollow}
                  data-testid="assistant-source"
                >
                  <span className="assistantsources__kind">{SOURCE_KIND_LABELS[source.kind]}</span>{' '}
                  <bdi>{source.title}</bdi>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
