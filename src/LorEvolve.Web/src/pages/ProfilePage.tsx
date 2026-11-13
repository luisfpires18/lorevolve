import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { AssistantUsage } from '../components/AssistantUsage'
import { ConnectedApps } from '../components/ConnectedApps'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { PublicAuthorSection } from '../components/PublicAuthorSection'
import { PublicNameForm } from '../components/PublicNameForm'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { StorageUsage } from '../components/StorageUsage'
import { ThemeSwitch } from '../components/ThemeSwitch'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { useI18n } from '../i18n'
import { useQueryTab } from '../lib/queryTab'
import { listUniverses } from '../universes/api'

/**
 * The signed-in account, and only what LorEvolve genuinely knows about it.
 *
 * A user-level screen rather than a universe one: nothing here belongs to a world, so it sits
 * beside the universes and the ideas at `/app/profile`, inside My workspace's frame
 * (`WorkspaceLayout`). It is not one of that frame's tabs: it is reached from the account menu,
 * which is on every screen in LorEvolve, a universe's included.
 *
 * The circle near the top is the account's photo, or its initial when there is none. The username is
 * the account's name here; the public name is a separate, chosen one, shown only as the author of
 * published universes (ADR 0036). The page shows only what LorEvolve genuinely holds.
 *
 * Under the name, three tabs in Settings' pattern (`QueryTabList`): Account (the facts, publishing, appearance),
 * Usage, and Connected apps, which `/app/profile?tab=connected-apps` opens directly.
 */
export default function ProfilePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  // The profile's tabs, as Settings' are: kept in the address (`?tab=`), Account the page itself.
  const TABS = [
    { id: 'account', label: t('account.profile.tabs.account') },
    { id: 'usage', label: t('account.profile.tabs.usage') },
    { id: 'connected-apps', label: t('account.profile.tabs.connectedApps') },
  ] as const
  const [tab, choose] = useQueryTab(TABS)

  const [universeCount, setUniverseCount] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    // A count is a nicety on this screen, not its subject: if it cannot be read the row is
    // left out rather than the page failing over it.
    listUniverses({ search: '', includeArchived: true, page: 1 }, controller.signal)
      .then((page) => setUniverseCount(page.totalCount))
      .catch(() => setUniverseCount(null))

    return () => {
      controller.abort()
    }
  }, [])

  // RequireAuth holds this route, so a signed-out visitor never reaches this render.
  if (!user) return null

  return (
    <article className="profile" data-testid="profile">
      <h1 className="profile__title">{t('account.profile.title')}</h1>

      <ProfileAvatar name={user.username} />

      <p className="profile__name" data-testid="profile-name">
        {user.username}
      </p>

      <QueryTabList
        label={t('account.profile.tabsLabel')}
        idPrefix="profile"
        tabs={TABS}
        tab={tab}
        onChoose={choose}
      />

      <TabPanel idPrefix="profile" id="account" tab={tab}>
        <dl className="profile__facts">
          <div className="profile__fact">
            <dt className="profile__label">{t('account.profile.email')}</dt>
            <dd className="profile__value" data-testid="profile-email">
              {user.email}
            </dd>
          </div>
          {universeCount === null ? null : (
            <div className="profile__fact">
              <dt className="profile__label">{t('account.profile.universes')}</dt>
              <dd className="profile__value" data-testid="profile-universes">
                {universeCount}
              </dd>
            </div>
          )}
        </dl>

        <section className="profile__public" aria-labelledby="profile-public-heading">
          <h2 className="profile__subtitle" id="profile-public-heading">
            {t('account.profile.publishing')}
          </h2>
          <PublicNameForm />
          <PublicAuthorSection />
        </section>

        <section className="profile__public" aria-labelledby="profile-appearance-heading">
          <h2 className="profile__subtitle" id="profile-appearance-heading">
            {t('account.profile.appearance')}
          </h2>
          <p className="settings__note">{t('account.profile.themeNote')}</p>
          <ThemeSwitch />
          <LanguageSwitch />
        </section>

        <p className="profile__note">{t('account.profile.note')}</p>
      </TabPanel>

      <TabPanel idPrefix="profile" id="usage" tab={tab}>
        <section
          className="profile__public usage"
          aria-labelledby="profile-usage-heading"
          data-testid="profile-usage"
        >
          <h2 className="profile__subtitle" id="profile-usage-heading">
            {t('account.profile.usageHeading')}
          </h2>
          <StorageUsage />
          <AssistantUsage />
        </section>
      </TabPanel>

      <TabPanel idPrefix="profile" id="connected-apps" tab={tab}>
        <ConnectedApps />
      </TabPanel>
    </article>
  )
}
