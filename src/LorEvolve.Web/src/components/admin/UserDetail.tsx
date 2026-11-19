import type { AdminUserDetail } from '../../admin/api'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../Avatar'
import { formatBytes } from '../../lib/bytes'
import { formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'
import { NOT_RECORDED, NOT_TRACKED, ROLE_KEYS } from '../../admin/adminConstants'
import { BlockSection } from './BlockSection'
import { Fact } from './Fact'
import { PasswordSection } from './PasswordSection'
import { QuietNote } from '../QuietNote'

const HISTORY_KEYS = {
  Block: 'admin.history.blocked',
  Unblock: 'admin.history.unblocked',
  PasswordResetSent: 'admin.history.passwordResetSent',
} as const

export function UserDetail({
  user,
  onChange,
  onStale,
}: {
  user: AdminUserDetail
  onChange: (user: AdminUserDetail) => void
  onStale: () => void
}) {
  const { t, tx } = useI18n()
  const { user: me } = useAuth()

  return (
    <>
      <div className="adminprofile">
        <Avatar image={null} name={user.username} className="adminuser__avatar" />
        <div>
          <h1 className="home__title" dir="auto" data-testid="admin-user-title">
            {user.username}
          </h1>
          {user.publicDisplayName ? (
            <p className="home__lede" dir="auto">
              {t('admin.user.publicName', { name: user.publicDisplayName })}
            </p>
          ) : null}
        </div>
      </div>

      <section className="adminsection" aria-labelledby="admin-account">
        <h2 className="settings__heading" id="admin-account">
          {t('admin.user.account.heading')}
        </h2>
        <dl className="facts admindetail" data-testid="admin-user-facts">
          <Fact
            label={t('admin.user.account.id')}
            value={<code>{user.id}</code>}
            testId="admin-user-id"
          />
          <Fact
            label={t('admin.user.account.email')}
            value={user.email}
            testId="admin-user-email"
          />
          <Fact
            label={t('admin.user.account.role')}
            value={t(ROLE_KEYS[user.role])}
            testId="admin-user-role"
          />
          <Fact
            label={t('admin.user.account.status')}
            value={
              user.isBlocked
                ? user.blockedAt
                  ? t('admin.user.account.blockedSince', { time: formatDateTime(user.blockedAt) })
                  : t('admin.user.account.blockedSinceUnknown')
                : t('admin.user.account.active')
            }
            testId="admin-user-status"
          />
          <Fact
            label={t('admin.user.account.owned')}
            value={user.ownedUniverses}
            testId="admin-user-owned"
          />
          <Fact
            label={t('admin.user.account.shared')}
            value={user.sharedUniverses}
            testId="admin-user-shared"
          />
          <Fact
            label={t('admin.user.account.storage')}
            value={t('admin.user.account.storageValue', {
              used: formatBytes(user.storageUsedBytes),
              quota: formatBytes(user.storageQuotaBytes),
            })}
            testId="admin-user-storage"
          />
          <Fact
            label={t('admin.user.account.created')}
            value={user.createdAt ? formatDateTime(user.createdAt) : NOT_RECORDED}
            testId="admin-user-created"
          />
          <Fact
            label={t('admin.user.account.subscription')}
            value={NOT_TRACKED}
            testId="admin-user-subscription"
          />
        </dl>
      </section>

      <section className="adminsection" aria-labelledby="admin-sign-in">
        <h2 className="settings__heading" id="admin-sign-in">
          {t('admin.user.signIn.heading')}
        </h2>
        <dl className="facts admindetail" data-testid="admin-user-sign-in">
          <Fact
            label={t('admin.user.signIn.last')}
            value={user.lastSignInAt ? formatDateTime(user.lastSignInAt) : NOT_RECORDED}
            testId="admin-user-last-login"
          />
          <Fact
            label={t('admin.user.signIn.failed')}
            value={user.failedSignInAttempts}
            testId="admin-user-failed"
          />
          <Fact
            label={t('admin.user.signIn.lockout')}
            value={
              user.lockedOutUntil
                ? t('admin.user.signIn.lockedUntil', { time: formatDateTime(user.lockedOutUntil) })
                : t('admin.user.signIn.lockoutNone')
            }
            testId="admin-user-lockout"
          />
          <Fact
            label={t('admin.user.signIn.apps')}
            value={user.connectedApps}
            testId="admin-user-apps"
          />
          <Fact
            label={t('admin.user.signIn.appsUsed')}
            value={
              user.appLastUsedAt
                ? formatDateTime(user.appLastUsedAt)
                : t('admin.user.signIn.appsNever')
            }
            testId="admin-user-apps-used"
          />
        </dl>
      </section>

      <BlockSection user={user} isSelf={me?.id === user.id} onChange={onChange} onStale={onStale} />

      <PasswordSection user={user} onChange={onChange} onStale={onStale} />

      <section className="adminsection" aria-labelledby="admin-history">
        <h2 className="settings__heading" id="admin-history">
          {t('admin.history.heading')}
        </h2>
        {user.history.length === 0 ? (
          <p className="settings__note" data-testid="admin-history-empty">
            {t('admin.history.empty')}
          </p>
        ) : (
          <ol className="adminhistory" data-testid="admin-history">
            {user.history.map((entry) => (
              <li className="adminhistory__item" key={entry.id} data-testid="admin-history-item">
                <p className="adminhistory__line">
                  {tx('admin.history.line', {
                    action: <strong>{t(HISTORY_KEYS[entry.action])}</strong>,
                    actor: entry.actorUsername ?? t('admin.history.removedActor'),
                    time: <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>,
                  })}
                </p>
                {entry.reason ? (
                  <QuietNote className="adminhistory__reason" size="ui" wrap dir="auto">
                    {entry.reason}
                  </QuietNote>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  )
}
