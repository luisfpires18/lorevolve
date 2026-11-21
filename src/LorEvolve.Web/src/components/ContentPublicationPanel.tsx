import { Globe, Lock, PenLine } from 'lucide-react'
import type { ContentKind, ContentPublicationState, StoryPartKind } from '../publishing/types'
import { t, useI18n } from '../i18n'
import { ActionMenuItem } from './ActionMenu'

/**
 * The publication menu's body: what the state means, Edit summary for a story, and Publish or Make private. `look="bar"`
 * is a story part's (ADR 0039): its heading also names what the part publishes (`words.what`), and its one item says the
 * part's own verb.
 */
export function ContentPublicationPanel({
  look = 'panel',
  noteId,
  heading,
  explanation,
  kind,
  state,
  busy,
  setEditingSummary,
  isSelected,
  change,
  missingSummary,
  words,
}: {
  look?: 'panel' | 'bar'
  noteId: string
  heading: string
  explanation: string[]
  kind: ContentKind | StoryPartKind
  /** The item's stored state; a story's public summary is read from it. */
  state?: ContentPublicationState
  busy: boolean
  setEditingSummary?: (value: boolean) => void
  isSelected: boolean
  change: (publish: boolean) => Promise<void>
  missingSummary?: boolean
  /** `publish` is the item's verb; a part also says what it publishes and its own Make private. */
  words: { publish: string; what?: string; makePrivate?: string }
}) {
  useI18n()
  return (
    <>
      <div className="actionmenu__context contentpub__context" id={noteId}>
        <p className="contentpub__heading">
          {look === 'bar' ? `${heading} · ${words.what}` : heading}
        </p>
        {explanation.map((line) => (
          <p className="contentpub__note" key={line}>
            {line}
          </p>
        ))}
        {kind === 'story' && state?.publicSummary ? (
          <p className="contentpub__summary" data-testid="story-public-summary">
            <span className="contentpub__summarylabel">
              {t('stories.publication.content.summaryLabel')}
            </span>{' '}
            <span dir="auto">{state.publicSummary}</span>
          </p>
        ) : null}
      </div>
      {kind === 'story' && setEditingSummary ? (
        <ActionMenuItem
          icon={PenLine}
          disabled={busy}
          onClick={() => setEditingSummary(true)}
          testId="edit-story-public-summary"
        >
          {state?.publicSummary
            ? t('stories.publication.content.editSummary')
            : t('stories.publication.content.writeSummary')}
        </ActionMenuItem>
      ) : null}
      {isSelected ? (
        <ActionMenuItem
          icon={Lock}
          disabled={busy}
          aria-describedby={noteId}
          onClick={() => void change(false)}
          testId={`unpublish-${kind}`}
        >
          {words.makePrivate ?? t('stories.publication.content.makePrivate')}
        </ActionMenuItem>
      ) : (
        <ActionMenuItem
          icon={Globe}
          disabled={busy || missingSummary}
          aria-describedby={noteId}
          onClick={() => void change(true)}
          testId={`publish-${kind}`}
        >
          {words.publish}
        </ActionMenuItem>
      )}
    </>
  )
}
