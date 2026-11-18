import { useState } from 'react'
import { setBlocked, type AdminUserDetail } from '../../admin/api'
import { Field } from '../Field'
import { ApiError } from '../../lib/api'
import { confirmAction } from '../../lib/confirm'
import { useI18n } from '../../i18n'

export function BlockSection({
  user,
  isSelf,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  isSelf: boolean
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const { t } = useI18n()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const block = !user.isBlocked

  if (user.role === 'Admin') {
    return (
      <section className="adminsection" aria-labelledby="admin-access">
        <h2 className="settings__heading" id="admin-access">
          {t('admin.block.access')}
        </h2>
        <p className="settings__note" data-testid="admin-block-unavailable">
          {t(isSelf ? 'admin.block.unavailableSelf' : 'admin.block.unavailable')}
        </p>
      </section>
    )
  }

  async function submit() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setError(t('admin.block.reasonRequired'))
      return
    }
    setError(null)

    const done = await confirmAction({
      title: t(block ? 'admin.block.block.confirmTitle' : 'admin.block.unblock.confirmTitle', {
        username: user.username,
      }),
      message: t(block ? 'admin.block.block.confirmMessage' : 'admin.block.unblock.confirmMessage'),
      details: [t('admin.block.reasonDetail', { reason: trimmed })],
      confirmLabel: t(
        block ? 'admin.block.block.confirmLabel' : 'admin.block.unblock.confirmLabel',
      ),
      busyLabel: t(block ? 'admin.block.block.busy' : 'admin.block.unblock.busy'),
      variant: block ? 'destructive' : 'neutral',
      action: async () => {
        try {
          onChange(await setBlocked(user.id, block, trimmed))
        } catch (failure: unknown) {
          if (failure instanceof ApiError && failure.status === 409) onStale()
          throw failure
        }
      },
    })
    if (done) setReason('')
  }

  return (
    <section
      className={block ? 'adminsection settings__section--danger' : 'adminsection'}
      aria-labelledby="admin-access"
    >
      <h2 className="settings__heading" id="admin-access">
        {t(block ? 'admin.block.block.heading' : 'admin.block.unblock.heading')}
      </h2>
      <p className="settings__note">
        {t(block ? 'admin.block.block.note' : 'admin.block.unblock.note')}
      </p>
      <form
        className="adminblock"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field
          label={t('admin.block.reasonLabel')}
          id="admin-reason"
          error={error ? <span data-testid="admin-reason-error">{error}</span> : undefined}
        >
          {(control) => (
            <textarea
              id={control.id}
              className="field__input field__input--area"
              rows={3}
              maxLength={500}
              value={reason}
              aria-invalid={control['aria-invalid']}
              aria-describedby={control['aria-describedby']}
              onChange={(event) => setReason(event.target.value)}
              data-testid="admin-reason"
            />
          )}
        </Field>
        <button
          className={block ? 'button button--secondary button--danger-quiet' : 'button'}
          type="submit"
          data-testid={block ? 'admin-block' : 'admin-unblock'}
        >
          {t(block ? 'admin.block.block.submit' : 'admin.block.unblock.submit')}
        </button>
      </form>
    </section>
  )
}
