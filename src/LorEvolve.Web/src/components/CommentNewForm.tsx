import { COMMENT_MAX_LENGTH } from '../comments/api'
import { useI18n } from '../i18n'
import { Field } from './Field'

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
      className="reviewform"
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
        <button
          className="button button--sm"
          type="submit"
          disabled={busy !== null}
          data-testid="comment-new-post"
        >
          {busy === 'new' ? t('review.comments.posting') : t('review.comments.post')}
        </button>
      </div>
    </form>
  )
}
