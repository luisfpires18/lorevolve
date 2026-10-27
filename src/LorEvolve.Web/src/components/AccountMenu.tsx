import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, LogOut, ShieldCheck, StickyNote, Telescope, UserRound } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { confirmLeaving } from '../lib/leaveGuard'
import { useProfileImage } from '../profile/useProfileImage'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { Avatar } from './Avatar'
import { ThemeSwitch } from './ThemeSwitch'
import { VERSION_LABEL } from '../lib/buildInfo'

/**
 * The account, everywhere: a circular avatar that opens onto who you are, your profile and the way
 * out.
 *
 * One component for every place account access belongs - the portal's bar, My workspace's bar, a
 * universe's black rail, and the folded mobile bar, which is the same rail. Not lookalikes:
 * the avatar, the photo, the fallback, the keyboard behaviour and the wording have one
 * implementation, and `variant` only says which surface it is drawn on.
 *
 * The opening, closing and keyboard behaviour is `ActionMenu`'s, the same as every other menu in
 * LorEvolve: a disclosure of ordinary links and buttons, opened by a click or a tap, closed by Escape
 * (focus back on the trigger) or by a press outside.
 *
 * Besides the account it holds LorEvolve's three places by name - My workspace, Ideas and Explore - so
 * that from anywhere, a universe's deepest screen included, the way out is a labelled link and not
 * a logo to be recognised. The same group on every surface, whichever screen is open: one menu,
 * one map. They are ordinary links; none is marked current, so the menu always opens on its first.
 *
 * Signing out lands on `/login` from the workspace; the portal passes `signedOutTo` so a visitor stays on the
 * public page they were reading - the portal needs no session.
 *
 * The avatar comes from `useProfileImage`, so every one of these and the Profile screen show the
 * same photo the moment it changes - see `ProfileImageProvider`.
 */
export function AccountMenu({
  variant,
  signedOutTo = '/login',
}: {
  variant: 'rail' | 'bar'
  signedOutTo?: string
}) {
  const { user, logOut } = useAuth()
  const { image } = useProfileImage()
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const goToId = useId()

  // Signed out there is no account, and no menu. The guarded routes never render this, but the
  // check keeps it honest for anything that later does.
  const signedIn = user !== null

  async function signOut() {
    // A way out of whatever is open, and a button rather than a link, so the leave guard's link check never sees it.
    if (!(await confirmLeaving())) return

    setBusy(true)
    try {
      await logOut()
      await navigate(signedOutTo, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (!signedIn) return null

  return (
    <div className={`accountmenu accountmenu--${variant}`} data-testid="account-menu">
      {variant === 'bar' ? (
        // A label beside the circle on a wide header, where there is room for it and a bare
        // avatar would be the only unlabelled thing in the bar. Hidden on a narrow one.
        <span className="accountmenu__name" dir="auto" data-testid="signed-in-user">
          {user.username}
        </span>
      ) : null}

      <ActionMenu
        label="Open account menu"
        trigger={<Avatar image={image} name={user.username} className="accountmenu__avatar" />}
        triggerClassName="accountmenu__trigger"
        panelClassName="accountmenu__panel"
        triggerTestId="account-menu-trigger"
        panelTestId="account-menu-panel"
      >
        <div className="actionmenu__context">
          <p className="accountmenu__username" dir="auto">
            {user.username}
          </p>
          <p className="accountmenu__email" dir="ltr">
            {breakable(user.email)}
          </p>
        </div>

        <div className="accountmenu__goto" role="group" aria-labelledby={goToId}>
          <p className="accountmenu__grouplabel" id={goToId}>
            Go to
          </p>
          <Link className="actionmenu__item" to="/app" data-testid="account-menu-workspace">
            <ActionIcon icon={BookOpen} />
            My workspace
          </Link>
          <Link className="actionmenu__item" to="/app/ideas" data-testid="account-menu-ideas">
            <ActionIcon icon={StickyNote} />
            Ideas
          </Link>
          <Link className="actionmenu__item" to="/explore" data-testid="account-menu-explore">
            <ActionIcon icon={Telescope} />
            Explore
          </Link>
          {/* Only for an Admin (#40). Hiding it is courtesy; the server refuses the Admin API to anyone else. */}
          {user.isAdmin ? (
            <Link className="actionmenu__item" to="/admin" data-testid="account-menu-admin">
              <ActionIcon icon={ShieldCheck} />
              LorEvolve Admin
            </Link>
          ) : null}
        </div>

        <Link className="actionmenu__item" to="/app/profile" data-testid="account-menu-profile">
          <ActionIcon icon={UserRound} />
          Profile
        </Link>

        {/* The one appearance choice, for the portal and the workspace alike (013). */}
        <div className="actionmenu__section">
          <ThemeSwitch inMenu />
        </div>

        {/* Stays open while it works, so "Signing out" is seen where the press was. */}
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          data-keep-open
          data-testid="account-menu-signout"
        >
          <ActionIcon icon={LogOut} />
          {busy ? 'Signing out' : 'Sign out'}
        </button>

        {/* Which LorEvolve is running, for anyone asked "what version are you on?". Read, never pressed. */}
        <p className="accountmenu__version" data-testid="account-menu-version">
          {VERSION_LABEL}
        </p>
      </ActionMenu>
    </div>
  )
}

/**
 * An email address with its natural breaks offered - before the @ and before each dot - so a long one wraps as
 * name / @domain / .tld rather than wherever the panel's edge happens to fall.
 */
function breakable(email: string) {
  return email
    .split(/(?=[@.])/)
    .flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]))
}
