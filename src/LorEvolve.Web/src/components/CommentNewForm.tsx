import { COMMENT_MAX_LENGTH } from '../comments/api'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { Button } from './Button'

/** The review drawer's form for a new comment thread. */
export function CommentNewForm({
  newId,
  draft,
  setDraft,
  draftError,
  busy,
  post,
}: {
  newId: string
  draft: string
  setDraft: (value: string) => void
  draftError: string | null
  busy: string | null
  post: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <form
      className="stack stack--2"
      onSubmit={(event) => {
        event.preventDefault()
        void post()
      }}
    >
      <Field id={newId} label={t('review.comments.newComment')} error={draftError}>
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={3}
            dir="auto"
            maxLength={COMMENT_MAX_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            data-testid="comment-new-text"
          />
        )}
      </Field>
      <div>
        <Button size="sm" type="submit" disabled={busy !== null} data-testid="comment-new-post">
          {busy === 'new' ? t('review.comments.posting') : t('review.comments.post')}
        </Button>
      </div>
    </form>
  )
}
