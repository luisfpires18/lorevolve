import { useEffect, useId, useState } from 'react'
import { ChevronDown, Globe, Lock, PenLine } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { StoryPublicSummaryForm } from './StoryPublicSummaryForm'
import { getContentPublication, publishContent, unpublishContent } from '../publishing/api'
import { Visibility, type ContentKind, type ContentPublicationState } from '../publishing/types'

/** What each kind lists publicly and what it keeps private - said before publishing, never discovered after. */
const WORDS = {
  entry: {
    noun: 'entry',
    listed: 'Readers see its name, type, summary, picture and article.',
    kept: 'Its fields, aliases, tags, relationships and history are not published.',
    isPublic: 'This lore entry is available in your public universe.',
    willPublish: 'Publishing this lore entry makes it available in your public universe.',
  },
  story: {
    noun: 'story',
    listed:
      'Readers see its title, its public summary, and the scenes, prose and plot arcs you publish from them.',
    kept: 'Its premise, chapters and notes are not published, nor any scene, prose or arc you have not published.',
    needsSummary:
      'This story is selected for publication but needs a public summary before readers can see it.',
    noSummary: 'A story needs a public summary, written for readers, before it can be published.',
    isPublic: 'This story is selected for your public universe.',
    willPublish: 'Publishing this story selects it for your public universe.',
    selectedHidden:
      'This story is selected for publication, but remains hidden while the universe is private.',
    willSelect:
      'Your universe is private. Publishing selects this story: it remains hidden while the universe is private.',
  },
} as const

type Shown = 'private' | 'public' | 'selected'

/** Whether a story still lacks the public summary readers need (Task 011). Always false for an entry. */
function lacksSummary(kind: ContentKind, state: ContentPublicationState) {
  return kind === 'story' && !state.publicSummary
}

function shownOf(kind: ContentKind, state: ContentPublicationState): Shown {
  if (state.visibility !== Visibility.Public) return 'private'
  return state.universeIsPublic && !lacksSummary(kind, state) ? 'public' : 'selected'
}

const LABELS: Record<Shown, string> = {
  private: 'Private',
  public: 'Public',
  selected: 'Selected',
}

/**
 * One lore entry's or story's publication (ADR 0036, Tasks 010-011): its state as a pill, which opens what that state
 * means and the one thing to do about it. A story also carries its public summary here - written for readers, never its
 * premise - which it needs before it can be published; one selected without one stays Selected, and says why.
 *
 * The state is always a word - Private, Public, or Selected when the item is chosen but its universe is private -
 * never a colour alone, and the universe's part is always said, so the author never has to work out whether anyone
 * can see it. Opening it is the confirmation: what gets listed, what stays private and the explicit verb, on the
 * `ActionMenu` disclosure, so keyboard, focus and Escape behave as every other menu does. Publishing never touches a
 * form, so it cannot leave one dirty; a refusal leaves everything as it was and says so.
 *
 * `placement` says where the panel hangs: `bar` under the end of the bar it sits in, `line` under the start of the
 * line of facts it sits in. Either way it is bounded by that row, so it never leaves a phone's screen.
 */
export function ContentPublication({
  universeId,
  kind,
  id,
  name,
  placement,
  initialState,
  onChange,
}: {
  universeId: string
  kind: ContentKind
  id: string
  name: string
  placement: 'bar' | 'line'
  /** Already read by the page, which then owns the answer too; the control reads it itself otherwise. */
  initialState?: ContentPublicationState
  /** Every state this control arrives at, so a page can follow it - a story's parts follow the story's (ADR 0039). */
  onChange?: (state: ContentPublicationState) => void
}) {
  const noteId = useId()
  const [state, setStateOnly] = useState<ContentPublicationState | null>(initialState ?? null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [editingSummary, setEditingSummary] = useState(false)
  const words = WORDS[kind]

  function setState(next: ContentPublicationState) {
    setStateOnly(next)
    onChange?.(next)
  }

  const known = initialState !== undefined
  useEffect(() => {
    if (known) return
    const controller = new AbortController()
    getContentPublication(universeId, kind, id, controller.signal)
      .then((loaded) => {
        setStateOnly(loaded)
        setFailed(null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed('Publication status unavailable.')
      })
    return () => {
      controller.abort()
    }
  }, [universeId, kind, id, known])

  if (!state) {
    return failed ? (
      <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
        {failed}
      </span>
    ) : null
  }

  // An entry's choice only matters in a public universe (Issue #47): a private universe hides every entry anyway, so its
  // pages offer no pill. The stored selection is untouched, and publishing the universe says how many entries it holds.
  if (kind === 'entry' && !state.universeIsPublic) return null

  const shown = shownOf(kind, state)
  const isSelected = state.visibility === Visibility.Public
  const missingSummary = lacksSummary(kind, state)

  async function change(publish: boolean) {
    setBusy(true)
    setFailed(null)
    setAnnouncement('')
    try {
      const next = publish
        ? await publishContent(universeId, kind, id)
        : await unpublishContent(universeId, kind, id)
      setState(next)
      setAnnouncement(
        !publish
          ? `Made private. It is no longer listed in your public universe.`
          : next.universeIsPublic && !lacksSummary(kind, next)
            ? `Published. It is listed in your public universe.`
            : `Selected for publication. It stays hidden while the universe is private.`,
      )
    } catch {
      // Nothing changed: the state shown is still the stored one.
      setFailed(`It could not be ${publish ? 'published' : 'made private'}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  const heading =
    shown === 'public' ? 'Public' : shown === 'selected' ? 'Selected for publication' : 'Private'

  const explanation =
    shown === 'public'
      ? [words.isPublic, words.listed, words.kept]
      : shown === 'selected'
        ? [missingSummary ? WORDS.story.needsSummary : WORDS.story.selectedHidden, words.kept]
        : [
            `Only you can see this ${words.noun}.`,
            missingSummary
              ? WORDS.story.noSummary
              : state.universeIsPublic
                ? words.willPublish
                : WORDS.story.willSelect,
            words.listed,
            words.kept,
          ]

  return (
    <div className={`contentpub contentpub--${placement}`}>
      <ActionMenu
        className="contentpub__menu"
        label={`Publication: ${LABELS[shown]}`}
        triggerClassName={`contentpub__trigger contentpub__trigger--${shown}`}
        trigger={
          <>
            {isSelected ? (
              <Globe
                className="contentpub__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
            ) : (
              <Lock
                className="contentpub__icon"
                aria-hidden="true"
                focusable="false"
                strokeWidth={1.75}
              />
            )}
            <span data-testid={`${kind}-publication-state`}>{LABELS[shown]}</span>
            <ChevronDown
              className="contentpub__chevron"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
          </>
        }
        panelClassName="contentpub__panel"
        triggerTestId={`${kind}-publication`}
        panelTestId={`${kind}-publication-panel`}
      >
        <div className="actionmenu__context contentpub__context" id={noteId}>
          <p className="contentpub__heading">{heading}</p>
          {explanation.map((line) => (
            <p className="contentpub__note" key={line}>
              {line}
            </p>
          ))}
          {kind === 'story' && state.publicSummary ? (
            <p className="contentpub__summary" data-testid="story-public-summary">
              <span className="contentpub__summarylabel">Public summary</span>{' '}
              <span dir="auto">{state.publicSummary}</span>
            </p>
          ) : null}
        </div>
        {kind === 'story' ? (
          <button
            className="actionmenu__item"
            type="button"
            disabled={busy}
            onClick={() => setEditingSummary(true)}
            data-testid="edit-story-public-summary"
          >
            <PenLine
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            {state.publicSummary ? 'Edit public summary…' : 'Write public summary…'}
          </button>
        ) : null}
        {isSelected ? (
          <button
            className="actionmenu__item"
            type="button"
            disabled={busy}
            aria-describedby={noteId}
            onClick={() => void change(false)}
            data-testid={`unpublish-${kind}`}
          >
            <Lock
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            Make private
          </button>
        ) : (
          <button
            className="actionmenu__item"
            type="button"
            disabled={busy || missingSummary}
            aria-describedby={noteId}
            onClick={() => void change(true)}
            data-testid={`publish-${kind}`}
          >
            <Globe
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            Publish {words.noun}
          </button>
        )}
      </ActionMenu>
      {failed ? (
        <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
          {failed}
        </span>
      ) : null}
      {editingSummary ? (
        <StoryPublicSummaryForm
          universeId={universeId}
          storyId={id}
          title={name}
          summary={state.publicSummary ?? null}
          onClose={() => setEditingSummary(false)}
          onSaved={(next) => {
            setEditingSummary(false)
            setState(next)
            setAnnouncement(
              next.publicSummary ? 'Public summary saved.' : 'Public summary removed.',
            )
          }}
        />
      ) : null}
      <span className="visually-hidden" role="status" data-testid={`${kind}-publication-announcer`}>
        {announcement ? (
          <>
            <bdi>{name}</bdi>: {announcement}
          </>
        ) : null}
      </span>
    </div>
  )
}
