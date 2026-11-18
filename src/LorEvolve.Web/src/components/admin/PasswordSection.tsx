import { useState } from 'react'
import { emailPasswordReset, type AdminUserDetail } from '../../admin/api'
import { ApiError } from '../../lib/api'
import { confirmAction } from '../../lib/confirm'
import { useI18n } from '../../i18n'

/**
 * Forgot password on the account's behalf (#69): LorEvolve emails the account its own reset link. The Admin sees
 * neither the address nor the link, and the send goes into the account's history.
 */
export function PasswordSection({
  user,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const { t } = useI18n()
  const [sent, setSent] = useState(false)

  async function send() {
    setSent(false)
    const done = await confirmAction({
      title: t('admin.password.confirmTitle', { username: user.username }),
      message: t('admin.password.confirmMessage'),
      confirmLabel: t('admin.password.confirmLabel'),
      busyLabel: t('admin.password.busy'),
      variant: 'neutral',
      action: async () => {
        try {
          onChange(await emailPasswordReset(user.id))
        } catch (failure: unknown) {
          if (failure instanceof ApiError && failure.status === 409) onStale()
          throw failure
        }
      },
    })
    if (done) setSent(true)
  }

  return (
    <section className="adminsection" aria-labelledby="admin-password">
      <h2 className="settings__heading" id="admin-password">
        {t('admin.password.heading')}
      </h2>
      <p className="settings__note">
        {user.isBlocked ? t('admin.password.noteBlocked') : t('admin.password.note')}
      </p>
      <div className="form__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={user.isBlocked}
          onClick={() => void send()}
          data-testid="admin-password-reset"
        >
          {t('admin.password.send')}
        </button>
      </div>
      {sent ? (
        <p className="settings__note" role="status" data-testid="admin-password-reset-sent">
          {t('admin.password.sent')}
        </p>
      ) : null}
    </section>
  )
}
