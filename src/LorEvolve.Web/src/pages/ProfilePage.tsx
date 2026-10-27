import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { AssistantUsage } from '../components/AssistantUsage'
import { ConnectedApps } from '../components/ConnectedApps'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { PublicAuthorSection } from '../components/PublicAuthorSection'
import { PublicNameForm } from '../components/PublicNameForm'
import { StorageUsage } from '../components/StorageUsage'
import { ThemeSwitch } from '../components/ThemeSwitch'
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
 */
export default function ProfilePage() {
  const { user } = useAuth()

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
      <h1 className="profile__title">Profile</h1>

      <ProfileAvatar name={user.username} />

      <p className="profile__name" data-testid="profile-name">
        {user.username}
      </p>

      <dl className="profile__facts">
        <div className="profile__fact">
          <dt className="profile__label">Email</dt>
          <dd className="profile__value" data-testid="profile-email">
            {user.email}
          </dd>
        </div>
        {universeCount === null ? null : (
          <div className="profile__fact">
            <dt className="profile__label">Universes</dt>
            <dd className="profile__value" data-testid="profile-universes">
              {universeCount}
            </dd>
          </div>
        )}
        <div className="profile__fact">
          <dt className="profile__label">Account ID</dt>
          <dd className="profile__value profile__value--id" data-testid="profile-id">
            {user.id}
          </dd>
        </div>
      </dl>

      <section
        className="profile__public usage"
        aria-labelledby="profile-usage-heading"
        data-testid="profile-usage"
      >
        <h2 className="profile__subtitle" id="profile-usage-heading">
          Usage
        </h2>
        <StorageUsage />
        <AssistantUsage />
      </section>

      <ConnectedApps />

      <section className="profile__public" aria-labelledby="profile-public-heading">
        <h2 className="profile__subtitle" id="profile-public-heading">
          Publishing
        </h2>
        <PublicNameForm />
        <PublicAuthorSection />
      </section>

      <section className="profile__public" aria-labelledby="profile-appearance-heading">
        <h2 className="profile__subtitle" id="profile-appearance-heading">
          Appearance
        </h2>
        <p className="settings__note">
          One theme for the whole of LorEvolve - the public portal and your workspace. It is kept in
          this browser.
        </p>
        <ThemeSwitch />
      </section>

      <p className="profile__note">
        LorEvolve keeps only what it needs to sign you in: a username, an email address, and the photo
        above if you add one - and the public name above, if you choose one, which is the only thing
        the public portal shows about you, with your author page's address. Your photo is private -
        served only to your own signed-in session - unless you choose to show it on your author
        page, and it is never part of a universe backup.
      </p>
    </article>
  )
}
