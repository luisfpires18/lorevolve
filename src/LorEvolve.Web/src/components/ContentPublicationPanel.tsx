import { Globe, Lock, PenLine } from 'lucide-react'
import type { ContentKind, ContentPublicationState } from '../publishing/types'
import { t, useI18n } from '../i18n'
import type { wordsOf } from '../publishing/contentPublicationWords'
import { ActionMenuItem } from './ActionMenu'

/** The publication menu's body: what the state means, Edit summary for a story, and Publish or Make private. */
export function ContentPublicationPanel({
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
  noteId: string
  heading: string
  explanation: string[]
  kind: ContentKind
  state: ContentPublicationState
  busy: boolean
  setEditingSummary: (value: boolean) => void
  isSelected: boolean
  change: (publish: boolean) => Promise<void>
  missingSummary: boolean
  words: ReturnType<typeof wordsOf>
}) {
  useI18n()
  return (
    <>
      <div className="actionmenu__context contentpub__context" id={noteId}>
        <p className="contentpub__heading">{heading}</p>
        {explanation.map((line) => (
          <p className="contentpub__note" key={line}>
            {line}
          </p>
        ))}
        {kind === 'story' && state.publicSummary ? (
          <p className="contentpub__summary" data-testid="story-public-summary">
            <span className="contentpub__summarylabel">
              {t('stories.publication.content.summaryLabel')}
            </span>{' '}
            <span dir="auto">{state.publicSummary}</span>
          </p>
        ) : null}
      </div>
      {kind === 'story' ? (
        <ActionMenuItem
          icon={PenLine}
          disabled={busy}
          onClick={() => setEditingSummary(true)}
          testId="edit-story-public-summary"
        >
          {state.publicSummary
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
          {t('stories.publication.content.makePrivate')}
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
