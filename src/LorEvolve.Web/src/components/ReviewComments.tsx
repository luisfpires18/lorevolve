import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { commentsPath, type CommentSubject } from '../comments/api'
import { useI18n } from '../i18n'
import type { Change } from '../lib/editConflict'
import { suggestionsPath } from '../suggestions/api'
import { CommentsDrawer } from './CommentsDrawer'

interface ReviewCommentsProps<T> {
  universeId: string
  subject: CommentSubject
  /** What the comments are about, as its title or name, for the drawer's heading. */
  subjectName: string
  /** A suggestion's two sides as the subject's own form shows its fields (task 045). */
  describeSuggestion: (before: T, proposed: T) => Change[]
  /** An accepted suggestion changed the subject: the page reads it again. */
  onSuggestionAccepted: () => void
  /** Opens the subject's own form to write a suggestion; the drawer closes first. */
  onSuggest: () => void
}

/**
 * The review layer for one piece of content: a Review button opening a drawer about the content as a whole, with its
 * comment threads (task 043) and its suggested changes (task 045) on two tabs. Nothing is read until the drawer opens -
 * comments then, suggestions only once their tab is chosen - so a page holding many subjects asks for none of either.
 * Every member reads; who may write, resolve, suggest and decide is the API's decision, mirrored here only to leave out
 * controls a role cannot use.
 */
export function ReviewComments<T>({
  universeId,
  subject,
  subjectName,
  describeSuggestion,
  onSuggestionAccepted,
  onSuggest,
}: ReviewCommentsProps<T>) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const path = commentsPath(universeId, subject)

  return (
    <>
      <button
        className="button button--text reviewtrigger"
        type="button"
        aria-haspopup="dialog"
        title={t('review.comments.trigger.title')}
        onClick={() => setIsOpen(true)}
        data-testid="comments-trigger"
      >
        <ActionIcon icon={MessageSquare} />
        <span className="reviewtrigger__label">{t('review.comments.trigger.label')}</span>
      </button>

      {isOpen ? (
        <CommentsDrawer
          key={path}
          universeId={universeId}
          path={path}
          suggestions={suggestionsPath(universeId, subject)}
          kind={subject.kind}
          subjectName={subjectName}
          describeSuggestion={describeSuggestion}
          onSuggestionAccepted={onSuggestionAccepted}
          onSuggest={onSuggest}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  )
}
