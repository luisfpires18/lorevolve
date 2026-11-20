import type { ReactNode } from 'react'
import type { AdminUserDetail } from '../../admin/api'
import { useAuth } from '../../auth/useAuth'
import { Avatar } from '../Avatar'
import { PageHeader } from '../PageHeader'
import { formatBytes } from '../../lib/bytes'
import { useI18n } from '../../i18n'
import { NOT_RECORDED, NOT_TRACKED, ROLE_KEYS } from '../../admin/adminConstants'
import { BlockSection } from './BlockSection'
import { Fact } from '../Fact'
import { FactList } from '../FactList'
import { PasswordSection } from './PasswordSection'
import { QuietNote } from '../QuietNote'
import { Section } from '../Section'
import { DateText } from '../DateText'

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
      <PageHeader
        lead={<Avatar image={null} name={user.username} className="adminuser__avatar" />}
        title={<span dir="auto">{user.username}</span>}
        titleTestId="admin-user-title"
        lede={
          user.publicDisplayName ? (
            <span dir="auto">{t('admin.user.publicName', { name: user.publicDisplayName })}</span>
          ) : undefined
        }
      />

      <Section title={t('admin.user.account.heading')} titleId="admin-account" rule={false}>
        <FactList className="admindetail" testId="admin-user-facts">
          <AdminFact
            label={t('admin.user.account.id')}
            value={<code>{user.id}</code>}
            testId="admin-user-id"
          />
          <AdminFact
            label={t('admin.user.account.email')}
            value={user.email}
            testId="admin-user-email"
          />
          <AdminFact
            label={t('admin.user.account.role')}
            value={t(ROLE_KEYS[user.role])}
            testId="admin-user-role"
          />
          <AdminFact
            label={t('admin.user.account.status')}
            value={
              user.isBlocked
                ? user.blockedAt
                  ? tx('admin.user.account.blockedSince', {
                      time: <DateText value={user.blockedAt} withTime />,
                    })
                  : t('admin.user.account.blockedSinceUnknown')
                : t('admin.user.account.active')
            }
            testId="admin-user-status"
          />
          <AdminFact
            label={t('admin.user.account.owned')}
            value={user.ownedUniverses}
            testId="admin-user-owned"
          />
          <AdminFact
            label={t('admin.user.account.shared')}
            value={user.sharedUniverses}
            testId="admin-user-shared"
          />
          <AdminFact
            label={t('admin.user.account.storage')}
            value={t('admin.user.account.storageValue', {
              used: formatBytes(user.storageUsedBytes),
              quota: formatBytes(user.storageQuotaBytes),
            })}
            testId="admin-user-storage"
          />
          <AdminFact
            label={t('admin.user.account.created')}
            value={user.createdAt ? <DateText value={user.createdAt} withTime /> : NOT_RECORDED}
            testId="admin-user-created"
          />
          <AdminFact
            label={t('admin.user.account.subscription')}
            value={NOT_TRACKED}
            testId="admin-user-subscription"
          />
        </FactList>
      </Section>

      <Section title={t('admin.user.signIn.heading')} titleId="admin-sign-in" rule={false}>
        <FactList className="admindetail" testId="admin-user-sign-in">
          <AdminFact
            label={t('admin.user.signIn.last')}
            value={
              user.lastSignInAt ? <DateText value={user.lastSignInAt} withTime /> : NOT_RECORDED
            }
            testId="admin-user-last-login"
          />
          <AdminFact
            label={t('admin.user.signIn.failed')}
            value={user.failedSignInAttempts}
            testId="admin-user-failed"
          />
          <AdminFact
            label={t('admin.user.signIn.lockout')}
            value={
              user.lockedOutUntil
                ? tx('admin.user.signIn.lockedUntil', {
                    time: <DateText value={user.lockedOutUntil} withTime />,
                  })
                : t('admin.user.signIn.lockoutNone')
            }
            testId="admin-user-lockout"
          />
          <AdminFact
            label={t('admin.user.signIn.apps')}
            value={user.connectedApps}
            testId="admin-user-apps"
          />
          <AdminFact
            label={t('admin.user.signIn.appsUsed')}
            value={
              user.appLastUsedAt ? (
                <DateText value={user.appLastUsedAt} withTime />
              ) : (
                t('admin.user.signIn.appsNever')
              )
            }
            testId="admin-user-apps-used"
          />
        </FactList>
      </Section>

      <BlockSection user={user} isSelf={me?.id === user.id} onChange={onChange} onStale={onStale} />

      <PasswordSection user={user} onChange={onChange} onStale={onStale} />

      <Section title={t('admin.history.heading')} titleId="admin-history" rule={false}>
        {user.history.length === 0 ? (
          <QuietNote spacing="block" testId="admin-history-empty">
            {t('admin.history.empty')}
          </QuietNote>
        ) : (
          <ol className="adminhistory" data-testid="admin-history">
            {user.history.map((entry) => (
              <li className="adminhistory__item" key={entry.id} data-testid="admin-history-item">
                <p className="adminhistory__line">
                  {tx('admin.history.line', {
                    action: <strong>{t(HISTORY_KEYS[entry.action])}</strong>,
                    actor: entry.actorUsername ?? t('admin.history.removedActor'),
                    time: <DateText value={entry.createdAt} withTime />,
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
      </Section>
    </>
  )
}

/** An account's fact: a value admin never tracks, or one from before the records began, reads as a quiet word. */
function AdminFact({
  label,
  value,
  testId,
}: {
  label: string
  value: ReactNode | typeof NOT_TRACKED | typeof NOT_RECORDED
  testId: string
}) {
  const { t } = useI18n()
  return (
    <Fact
      name={label}
      valueTestId={testId}
      valueClassName={
        value === NOT_TRACKED || value === NOT_RECORDED ? 'adminfact--none' : undefined
      }
    >
      {value === NOT_TRACKED
        ? t('admin.untracked.value')
        : value === NOT_RECORDED
          ? t('admin.user.beforeRecords')
          : value}
    </Fact>
  )
}
