import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useWholeTitle } from '../lib/useDocumentTitle'

/** The same words the server writes into this page's head (`PageMetadataResolver`, ADR 0038). */
const HOME_TITLE = 'LorEvolve | Build connected fictional universes'

/**
 * LorEvolve's home (031): what LorEvolve is, what it does, who it is for, that others' worlds can be read, and how to start -
 * then out, to Explore or into the workspace. A page of the portal, inside `PublicLayout`, so the bar, the session and
 * the theme are the portal's own; only its search stays on Explore, where it means something.
 *
 * Words on the portal's own ground, and nothing else (ADR 0068): no stock painting, no picture of a workspace, no
 * counts. Nothing here claims a feature LorEvolve does not have today. Published worlds are not pictured here; the
 * section points to Explore, which lists them. The way in has one name wherever it appears, in the bar and on the
 * page: Create account, or Go to my workspace once signed in.
 */
export default function LandingPage() {
  useWholeTitle(HOME_TITLE)
  const { user, isLoading } = useAuth()

  return (
    <div className="landing" data-testid="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero__inner">
          <h1 className="landing-hero__title" id="landing-title">
            <span>Build the world.</span> <span>Tell the story.</span>
          </h1>
          <p className="landing-hero__lede">
            LorEvolve keeps worldbuilding and writing together: the people, places and history of
            your universe, and the stories told inside it.
          </p>
          {/* Empty until the session is known, so a signed-in visitor never sees "Create account" first; the row keeps
              its height meanwhile (`.landing-actions`). */}
          <div className="landing-actions" data-testid="landing-hero-actions">
            {isLoading ? null : user ? (
              <Link
                className="landing-button landing-button--primary"
                to="/app"
                data-testid="landing-primary"
              >
                Go to my workspace
              </Link>
            ) : (
              <Link
                className="landing-button landing-button--primary"
                to="/register"
                data-testid="landing-primary"
              >
                Create account
              </Link>
            )}
            {isLoading ? null : (
              <Link className="landing-button" to="/explore" data-testid="landing-explore">
                Explore worlds
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="landing-section landing-build" aria-labelledby="landing-build">
        <div className="landing-split">
          <div className="landing-split__text">
            <h2 className="landing-heading" id="landing-build">
              Hold a whole universe, not one long document.
            </h2>
            <p className="landing-lede">
              Every character, place, faction and artefact gets an entry of its own, filed under
              types you define. The structure grows with the world.
            </p>
          </div>
          <dl className="landing-facets">
            <div className="landing-facet">
              <dt>Lore</dt>
              <dd>Entries with articles, pictures and the fields you design.</dd>
            </div>
            <div className="landing-facet">
              <dt>Types</dt>
              <dd>Your own categories, nested as deep as the world needs.</dd>
            </div>
            <div className="landing-facet">
              <dt>Family Tree</dt>
              <dd>Drawn from the relationships you record between characters.</dd>
            </div>
            <div className="landing-facet">
              <dt>Timeline and Chronology</dt>
              <dd>Events in order, with years counted the way your world counts them.</dd>
            </div>
            <div className="landing-facet">
              <dt>World Rules</dt>
              <dd>
                How your world works, stated plainly. A rule can be checked against the timeline.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="landing-connect" aria-labelledby="landing-connect">
        <div className="landing-connect__inner">
          <h2 className="landing-heading" id="landing-connect">
            Everything in it is connected.
          </h2>
          <p className="landing-lede">
            Write something down once, and LorEvolve puts it to work wherever it applies.
          </p>
          <ul className="landing-links">
            <li>
              <p className="landing-links__cause">Record how two characters are related.</p>
              <p className="landing-links__effect">
                Both entries show it, and the Family Tree draws it.
              </p>
            </li>
            <li>
              <p className="landing-links__cause">Date an event, and say who was there.</p>
              <p className="landing-links__effect">
                If someone takes part after their recorded death, Canon says so.
              </p>
            </li>
            <li>
              <p className="landing-links__cause">Link a scene to the lore it involves.</p>
              <p className="landing-links__effect">
                While you write it, those entries are one step away.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <section className="landing-section landing-write" aria-labelledby="landing-write">
        <div className="landing-split">
          <div className="landing-split__text">
            <h2 className="landing-heading" id="landing-write">
              Write the story inside the world.
            </h2>
            <p className="landing-lede">
              Stories hold chapters and scenes, and each scene its own manuscript. Plot arcs and
              beats map the shape of the telling, and the lore a scene involves stays close at hand.
            </p>
          </div>
          <div className="landing-media" data-testid="landing-audience">
            <p className="landing-media__list">Novels, films, comics, games and more.</p>
            <p className="landing-media__turn">
              Whatever form the story takes, the universe underneath it is the same.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-explore" aria-labelledby="landing-explore">
        <div className="landing-explore__head">
          <div>
            <h2 className="landing-heading" id="landing-explore">
              Read the worlds others have shared.
            </h2>
            <p className="landing-lede">
              Authors can publish a universe, and choose which of its entries and stories go with
              it. Anyone can read them in Explore, signed in or not.
            </p>
          </div>
          <Link className="landing-more" to="/explore" data-testid="landing-explore-all">
            Explore all worlds
          </Link>
        </div>
      </section>

      <section className="landing-section landing-trust" aria-labelledby="landing-trust">
        <h2 className="landing-heading" id="landing-trust">
          Your world stays yours.
        </h2>
        <div className="landing-prose">
          <p>
            A universe stays private until its owner publishes it, and then only the entries and
            stories they choose are public.
          </p>
          <p>
            Invite collaborators as Editors, Reviewers or Viewers. Sharing a universe never
            publishes it.
          </p>
          <p>
            Download a backup of a universe, pictures included, and restore it whenever you need to.
          </p>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="landing-final">
        <h2 className="landing-heading" id="landing-final">
          Every universe starts with a name.
        </h2>
        <p className="landing-lede">
          {isLoading
            ? ' '
            : user
              ? 'Your universes are where you left them.'
              : 'Create an account, name your first universe and begin with what you already know.'}
        </p>
        <div className="landing-actions" data-testid="landing-final-actions">
          {isLoading ? null : user ? (
            <Link className="landing-button landing-button--primary" to="/app">
              Go to my workspace
            </Link>
          ) : (
            <>
              <Link className="landing-button landing-button--primary" to="/register">
                Create account
              </Link>
              <Link className="landing-button" to="/login">
                Log in
              </Link>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
