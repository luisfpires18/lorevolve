import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Archive, Lock, Users } from 'lucide-react'
import { useAuth } from '../auth/useAuth'
import { WorldCard } from '../components/WorldCard'
import { useWholeTitle } from '../lib/useDocumentTitle'
import {
  getPublicStats,
  listPublicUniverses,
  type PublicStats,
  type PublicUniverse,
} from '../portal/api'
import heroImage from '../assets/atmosphere-citadel.webp'

/** How many published worlds the home page shows. The rest are Explore's. */
const PREVIEW_SIZE = 4

/** The same words the server writes into this page's head (`PageMetadataResolver`, ADR 0038). */
const HOME_TITLE = 'LorEvolve | Build connected fictional universes'

/** The four numbers, in the order they are read, under the words LorEvolve uses for them. */
const METRICS: { key: keyof PublicStats; label: string }[] = [
  { key: 'creators', label: 'Creators' },
  { key: 'universes', label: 'Universes' },
  { key: 'publishedWorlds', label: 'Published worlds' },
  { key: 'privateWorlds', label: 'Private worlds' },
]

const count = new Intl.NumberFormat('en')

type Stats = { kind: 'ready'; value: PublicStats } | { kind: 'error' } | null

type Worlds = { kind: 'ready'; items: PublicUniverse[] } | { kind: 'error' } | null

/**
 * LorEvolve's home (031): what LorEvolve is, what it does, who it is for, that others' worlds can be read, and how to start -
 * then out, to Explore or into the workspace. A page of the portal, inside `PublicLayout`, so the bar, the session and
 * the theme are the portal's own; only its search stays on Explore, where it means something.
 *
 * Everything on it is real. Under the hero, LorEvolve in four live numbers (`/api/public/stats`): shown as they are, zeros
 * included, never counted up and never guessed while they load; if they cannot be read the row simply is not there.
 * The worlds are the first page of the public listing, as Explore would show them; with none published, the section
 * says so rather than inventing any. Nothing here claims a feature LorEvolve does not have today, and no private workspace
 * is pictured.
 */
export default function LandingPage() {
  useWholeTitle(HOME_TITLE)
  const { user, isLoading } = useAuth()
  const [stats, setStats] = useState<Stats>(null)
  const [worlds, setWorlds] = useState<Worlds>(null)

  useEffect(() => {
    const controller = new AbortController()
    getPublicStats(controller.signal)
      .then((value) => setStats({ kind: 'ready', value }))
      .catch(() => {
        if (!controller.signal.aborted) setStats({ kind: 'error' })
      })
    listPublicUniverses({}, 1, controller.signal, PREVIEW_SIZE)
      .then((page) => setWorlds({ kind: 'ready', items: page.items }))
      .catch(() => {
        if (!controller.signal.aborted) setWorlds({ kind: 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [])

  return (
    <div className="landing" data-testid="landing">
      <section className="landing-hero" aria-labelledby="landing-title">
        <img
          className="landing-hero__image"
          src={heroImage}
          alt=""
          width={1672}
          height={941}
          fetchPriority="high"
          decoding="async"
        />
        <div className="landing-hero__inner">
          <p className="landing-hero__eyebrow">A workspace for fictional universes</p>
          <h1 className="landing-hero__title" id="landing-title">
            <span>Build the world.</span> <span>Tell the story.</span>{' '}
            <span className="landing-hero__turn">Whatever form it takes.</span>
          </h1>
          <p className="landing-hero__lede">
            LorEvolve keeps worldbuilding and writing together: the people, places and history of your
            universe, and the stories told inside it.
          </p>
          {/* Empty until the session is known, so a signed-in visitor never sees "Start building" first; the row keeps
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
                Start building
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

      {stats?.kind === 'error' ? null : (
        <section
          className="landing-metrics"
          aria-label="LorEvolve in numbers"
          data-testid="landing-metrics"
        >
          {/* While loading, the labels hold the row's place and the numbers are quiet bars - never a 0 that is not
              true. */}
          <dl className="landing-metrics__list" aria-busy={stats === null}>
            {METRICS.map(({ key, label }) => (
              <div className="landing-metric" key={key}>
                <dt className="landing-metric__label">{label}</dt>
                <dd className="landing-metric__value" data-testid={`landing-metric-${key}`}>
                  {stats?.kind === 'ready' ? (
                    count.format(stats.value[key])
                  ) : (
                    <span className="landing-metric__wait" aria-hidden="true" />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

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
          <h2 className="landing-heading landing-heading--statement" id="landing-connect">
            Everything in it is connected.
          </h2>
          <p className="landing-lede">
            Write something down once, and LorEvolve puts it to work wherever it applies.
          </p>
          <ul className="landing-links">
            <li>
              <p className="landing-links__cause">Record that Aurek is Ilse’s father.</p>
              <p className="landing-links__effect">
                Both entries show it, and the Family Tree draws it.
              </p>
            </li>
            <li>
              <p className="landing-links__cause">
                Date the night the city fell, and who was there.
              </p>
              <p className="landing-links__effect">
                If someone takes part after their recorded death, Canon says so.
              </p>
            </li>
            <li>
              <p className="landing-links__cause">Link a scene to Ilse and the sunken bell.</p>
              <p className="landing-links__effect">
                While you write it, both entries are one step away.
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
            <p className="landing-media__list">
              Novels, films and series. Comics and manga. Games and tabletop campaigns. Animation
              and audio drama.
            </p>
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
              it. Anyone can read them, signed in or not.
            </p>
          </div>
          <Link className="landing-more" to="/explore" data-testid="landing-explore-all">
            {worlds?.kind === 'ready' && worlds.items.length === 0
              ? 'Open Explore'
              : 'Explore all worlds'}
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} />
          </Link>
        </div>

        {worlds === null ? (
          <ul className="landing-worlds" aria-hidden="true" data-testid="landing-worlds-loading">
            {Array.from({ length: PREVIEW_SIZE }, (_, index) => (
              <li className="worldcard worldcard--skeleton" key={index}>
                <span className="worldcard__art" />
                <span className="worldcard__text">
                  <span className="worldcard__bone worldcard__bone--name" />
                  <span className="worldcard__bone worldcard__bone--chips" />
                  <span className="worldcard__bone worldcard__bone--short" />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {worlds?.kind === 'ready' && worlds.items.length > 0 ? (
          <ul className="landing-worlds" data-testid="landing-worlds">
            {worlds.items.map((world) => (
              <WorldCard key={world.slug} world={world} />
            ))}
          </ul>
        ) : null}

        {worlds?.kind === 'ready' && worlds.items.length === 0 ? (
          <p className="landing-quiet" data-testid="landing-worlds-empty">
            No worlds have been published yet. When an author makes a universe public, it appears in
            Explore.
          </p>
        ) : null}

        {worlds?.kind === 'error' ? (
          <p className="landing-quiet" data-testid="landing-worlds-error">
            The published worlds could not be loaded here. Explore has them all.
          </p>
        ) : null}
      </section>

      <section className="landing-section landing-trust" aria-labelledby="landing-trust">
        <h2 className="landing-heading" id="landing-trust">
          Your world stays yours.
        </h2>
        <ul className="landing-assurances">
          <li className="landing-assurance">
            <Lock aria-hidden="true" size={20} strokeWidth={1.75} />
            <h3>Private until you publish</h3>
            <p>
              A universe stays private until its owner publishes it, and then only the entries and
              stories they choose are public.
            </p>
          </li>
          <li className="landing-assurance">
            <Users aria-hidden="true" size={20} strokeWidth={1.75} />
            <h3>Shared on your terms</h3>
            <p>
              Invite collaborators as Editors, Reviewers or Viewers. Sharing a universe never
              publishes it.
            </p>
          </li>
          <li className="landing-assurance">
            <Archive aria-hidden="true" size={20} strokeWidth={1.75} />
            <h3>Yours to keep</h3>
            <p>
              Download a backup of a universe, pictures included, and restore it whenever you need
              to.
            </p>
          </li>
        </ul>
      </section>

      <section className="landing-final" aria-labelledby="landing-final">
        <h2 className="landing-heading landing-heading--statement" id="landing-final">
          Every universe starts with a name.
        </h2>
        <p className="landing-lede">
          {isLoading
            ? ' '
            : user
              ? 'Your universes are where you left them.'
              : 'Create an account, name your first universe and begin with what you already know.'}
        </p>
        <div
          className="landing-actions landing-actions--center"
          data-testid="landing-final-actions"
        >
          {isLoading ? null : user ? (
            <Link className="landing-button landing-button--primary" to="/app">
              Open my workspace
            </Link>
          ) : (
            <>
              <Link className="landing-button landing-button--primary" to="/register">
                Start building your universe
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
