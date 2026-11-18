import { useEffect, useId, useState } from 'react'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { StoryPublicSummaryForm } from './StoryPublicSummaryForm'
import { getContentPublication } from '../publishing/api'
import { Visibility, type ContentKind, type ContentPublicationState } from '../publishing/types'
import { t, useI18n } from '../i18n'
import { lacksSummary, shownOf, wordsOf, type Shown } from '../publishing/contentPublicationWords'
import { contentPublicationChange } from '../publishing/contentPublicationChange'
import { ContentPublicationPanel } from './ContentPublicationPanel'

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
  useI18n()
  const noteId = useId()
  const [state, setStateOnly] = useState<ContentPublicationState | null>(initialState ?? null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [editingSummary, setEditingSummary] = useState(false)
  const words = wordsOf(kind)
  const LABELS: Record<Shown, string> = {
    private: t('stories.publication.content.shown.private'),
    public: t('stories.publication.content.shown.public'),
    selected: t('stories.publication.content.shown.selected'),
  }

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
        if (!controller.signal.aborted) setFailed(t('stories.publication.content.unavailable'))
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

  const change = contentPublicationChange({
    universeId,
    kind,
    id,
    setBusy,
    setFailed,
    setAnnouncement,
    setState,
  })

  const heading =
    shown === 'public'
      ? t('stories.publication.content.headingPublic')
      : shown === 'selected'
        ? t('stories.publication.content.headingSelected')
        : t('stories.publication.content.headingPrivate')

  const explanation =
    shown === 'public'
      ? [words.isPublic, words.listed, words.kept]
      : shown === 'selected'
        ? [
            missingSummary
              ? t('stories.publication.content.story.needsSummary')
              : t('stories.publication.content.story.selectedHidden'),
            words.kept,
          ]
        : [
            words.onlyYou,
            missingSummary
              ? t('stories.publication.content.story.noSummary')
              : state.universeIsPublic
                ? words.willPublish
                : t('stories.publication.content.story.willSelect'),
            words.listed,
            words.kept,
          ]

  return (
    <div className={`contentpub contentpub--${placement}`}>
      <ActionMenu
        className="contentpub__menu"
        label={t('stories.publication.content.label', { state: LABELS[shown] })}
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
        <ContentPublicationPanel
          noteId={noteId}
          heading={heading}
          explanation={explanation}
          kind={kind}
          state={state}
          busy={busy}
          setEditingSummary={setEditingSummary}
          isSelected={isSelected}
          change={change}
          missingSummary={missingSummary}
          words={words}
        />
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
              next.publicSummary
                ? t('stories.publication.content.summarySaved')
                : t('stories.publication.content.summaryRemoved'),
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
