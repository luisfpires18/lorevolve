import { useEffect, useId, useState, type ReactNode } from 'react'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { StoryPublicSummaryForm } from './StoryPublicSummaryForm'
import { getContentPublication } from '../publishing/api'
import {
  Visibility,
  type ContentKind,
  type ContentPublicationState,
  type StoryPartKind,
} from '../publishing/types'
import { t, useI18n } from '../i18n'
import { lacksSummary, shownOf, wordsOf, type Shown } from '../publishing/contentPublicationWords'
import { contentPublicationChange } from '../publishing/contentPublicationChange'
import {
  partPublicationChange,
  partPublicationView,
  type StoryPart,
} from '../publishing/storyPartPublication'
import { ContentPublicationPanel } from './ContentPublicationPanel'
import { Announce } from './Announce'

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
 *
 * `part` makes it one part of a story - a scene's outline, a scene's prose, a plot arc (ADR 0039) - beside where the part
 * is written: the same pill and panel, in the part's own words, with the story's state held by the story page. `kind` is
 * then the part's kind.
 */
export function ContentPublication({
  universeId,
  kind,
  id,
  name,
  placement,
  initialState,
  onChange,
  part,
}: {
  universeId: string
  kind: ContentKind | StoryPartKind
  id: string
  name: string
  placement: 'bar' | 'line'
  /** Already read by the page, which then owns the answer too; the control reads it itself otherwise. */
  initialState?: ContentPublicationState
  /** Every state this control arrives at, so a page can follow it - a story's parts follow the story's (ADR 0039). */
  onChange?: (state: ContentPublicationState) => void
  part?: Omit<StoryPart, 'kind'>
}) {
  useI18n()
  const noteId = useId()
  const [state, setStateOnly] = useState<ContentPublicationState | null>(initialState ?? null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [editingSummary, setEditingSummary] = useState(false)
  const contentKind: ContentKind = kind === 'story' ? 'story' : 'entry'
  const words = wordsOf(contentKind)

  function setState(next: ContentPublicationState) {
    setStateOnly(next)
    onChange?.(next)
  }

  const known = initialState !== undefined || part !== undefined
  useEffect(() => {
    if (known) return
    const controller = new AbortController()
    getContentPublication(universeId, contentKind, id, controller.signal)
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
  }, [universeId, contentKind, id, known])

  const story = part ? { ...part, kind: kind as StoryPartKind } : null
  const partView = story ? partPublicationView(story) : null

  if (!state && !partView) {
    return failed ? (
      <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
        {failed}
      </span>
    ) : null
  }

  // An entry's choice only matters in a public universe (Issue #47): a private universe hides every entry anyway, so its
  // pages offer no pill. The stored selection is untouched, and publishing the universe says how many entries it holds.
  if (kind === 'entry' && !state?.universeIsPublic) return null

  let menu: {
    label: string
    isSelected: boolean
    shown: Shown
    stateLabel: string
    body: ReactNode
  }
  if (partView && story) {
    menu = {
      label: t('stories.publication.part.label', {
        what: partView.words.what,
        name,
        state: partView.labels[partView.shown],
      }),
      isSelected: partView.isSelected,
      shown: partView.shown,
      stateLabel: partView.labels[partView.shown],
      body: (
        <ContentPublicationPanel
          look="bar"
          noteId={noteId}
          heading={partView.heading}
          explanation={partView.explanation}
          kind={kind}
          busy={busy}
          isSelected={partView.isSelected}
          change={partPublicationChange({
            universeId,
            id,
            part: story,
            setBusy,
            setFailed,
            setAnnouncement,
          })}
          words={{
            publish: partView.words.verb,
            what: partView.words.what,
            makePrivate: t('stories.publication.part.makePrivate'),
          }}
        />
      ),
    }
  } else {
    const stored = state!
    const shown = shownOf(contentKind, stored)
    const isSelected = stored.visibility === Visibility.Public
    const missingSummary = lacksSummary(contentKind, stored)
    const LABELS: Record<Shown, string> = {
      private: t('stories.publication.content.shown.private'),
      public: t('stories.publication.content.shown.public'),
      selected: t('stories.publication.content.shown.selected'),
    }

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
                : stored.universeIsPublic
                  ? words.willPublish
                  : t('stories.publication.content.story.willSelect'),
              words.listed,
              words.kept,
            ]

    menu = {
      label: t('stories.publication.content.label', { state: LABELS[shown] }),
      isSelected,
      shown,
      stateLabel: LABELS[shown],
      body: (
        <ContentPublicationPanel
          noteId={noteId}
          heading={heading}
          explanation={explanation}
          kind={kind}
          state={stored}
          busy={busy}
          setEditingSummary={setEditingSummary}
          isSelected={isSelected}
          change={contentPublicationChange({
            universeId,
            kind: contentKind,
            id,
            setBusy,
            setFailed,
            setAnnouncement,
            setState,
          })}
          missingSummary={missingSummary}
          words={words}
        />
      ),
    }
  }

  const Icon = menu.isSelected ? Globe : Lock

  return (
    <div
      className={`contentpub contentpub--${placement}`}
      data-testid={part ? `${kind}-publication-control` : undefined}
    >
      <ActionMenu
        className="contentpub__menu"
        label={menu.label}
        triggerClassName={`contentpub__trigger contentpub__trigger--${menu.shown}`}
        trigger={
          <>
            <Icon
              className="contentpub__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <span data-testid={`${kind}-publication-state`}>{menu.stateLabel}</span>
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
        {menu.body}
      </ActionMenu>
      {failed ? (
        <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
          {failed}
        </span>
      ) : null}
      {editingSummary && state ? (
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
      <Announce testId={part ? undefined : `${kind}-publication-announcer`} inline>
        {announcement ? (
          <>
            <bdi>{name}</bdi>: {announcement}
          </>
        ) : null}
      </Announce>
    </div>
  )
}
