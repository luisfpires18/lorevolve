import { useId, useState } from 'react'
import { ChangeStatus, ProposalStatus, type Change, type Proposal } from '../../aiChanges/types'
import { mediaPreviewPath, uploadChangeMedia } from '../../aiChanges/media'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'

/**
 * A picture change's hand-over (ADR 0062): the AI sends no file, so the person uploads it here. It waits in quarantine - seen
 * only on this page - until the change is approved, and goes if it is rejected. Uploading again replaces it.
 */
export function MediaChange({
  universeId,
  proposal,
  change,
  onUploaded,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  onUploaded: (next: Proposal) => void
}) {
  const { t } = useI18n()
  const media = change.media!
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const waiting =
    change.status === ChangeStatus.Pending &&
    proposal.proposal.status === ProposalStatus.Open &&
    (proposal.canReview || proposal.proposal.proposedByMe)

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    setUploaded(false)
    try {
      onUploaded(await uploadChangeMedia(universeId, proposal.proposal.id, change.id, file))
      setUploaded(true)
    } catch (problem: unknown) {
      setError(
        problem instanceof ApiError
          ? (Object.values(problem.fieldErrors)[0] ?? problem.message)
          : t('review.aiChange.media.failed'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="aichangeitem__media" data-testid="ai-change-media">
      {media.uploaded && media.uploadedAt ? (
        <figure className="aichangeitem__picture">
          <img
            src={mediaPreviewPath(universeId, proposal.proposal.id, change.id, media.uploadedAt)}
            alt={t('review.aiChange.media.alt', { title: change.title })}
            width={160}
            height={160}
            loading="lazy"
            decoding="async"
            data-testid="ai-change-media-preview"
          />
          <figcaption>
            {media.fileName ?? t('review.aiChange.media.fallbackName')} · {media.width}×
            {media.height}
          </figcaption>
        </figure>
      ) : (
        <p className="aichangeitem__deps">{t('review.aiChange.media.none')}</p>
      )}
      {waiting ? (
        <Field
          label={
            media.uploaded ? t('review.aiChange.media.replace') : t('review.aiChange.media.upload')
          }
          id={inputId}
        >
          {(control) => (
            <input
              id={control.id}
              className="field__input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(event) => void upload(event.target.files?.[0])}
              data-testid="ai-change-media-file"
            />
          )}
        </Field>
      ) : null}
      {uploaded ? (
        <p className="aichangeitem__deps" role="status" data-testid="ai-change-media-uploaded">
          {t('review.aiChange.media.uploaded')}
        </p>
      ) : null}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
