import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { PortalError, PortalMissing } from '../components/PortalMissing'
import { WorldAttribution } from '../components/WorldAttribution'
import { formatDate } from '../lib/dates'
import {
  getPublicStory,
  getPublicUniverse,
  worldPath,
  type PublicStoryDetail,
  type PublicUniverse,
} from '../portal/api'
import { useWorkspaceLink } from '../portal/useWorkspaceLink'
import { useDocumentTitle } from '../lib/useDocumentTitle'

type LoadState =
  | { key: string; kind: 'ready'; world: PublicUniverse; story: PublicStoryDetail }
  | { key: string; kind: 'missing' }
  | { key: string; kind: 'error' }

/**
 * One published story at `/worlds/{world}/stories/{story}` (Task 011; a reader since Product refinement 015, ADR 0039): its
 * title, the summary its author wrote for readers, who it is by - with the original creator first for a world based on
 * someone else's work - and then exactly what its author published inside it, in the author's order: the manuscript (each
 * published scene's prose under its title), the scenes' outline, and any plot arc published on purpose. A section with
 * nothing in it is not drawn, and nothing counts or hints at what is private. The world it is set in closes the page.
 * Private and missing are one page; the owner, signed in, gets "Edit in workspace".
 */
export default function PublicStoryPage() {
  const { slug = '', storySlug = '' } = useParams<{ slug: string; storySlug: string }>()
  const key = `${slug}/${storySlug}`
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<LoadState | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      getPublicUniverse(slug, controller.signal),
      getPublicStory(slug, storySlug, controller.signal),
    ])
      .then(([world, story]) => setState({ key, kind: 'ready', world, story }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({ key, kind: (error as { status?: number }).status === 404 ? 'missing' : 'error' })
      })
    return () => {
      controller.abort()
    }
  }, [slug, storySlug, key, attempt])

  const current = state?.key === key ? state : null

  if (current?.kind === 'missing') {
    return <PortalMissing title="This page is not available." testId="story-missing" />
  }

  if (current?.kind === 'error') {
    return <PortalError onRetry={() => setAttempt((value) => value + 1)} />
  }

  if (!current) {
    return (
      <div className="pread" role="status" aria-label="Opening this story">
        <div className="pread__skeleton" />
      </div>
    )
  }

  return <Story world={current.world} story={current.story} />
}

/** Plain prose as its author wrote it: a blank line starts a paragraph, a single line break stays a line break. */
function paragraphs(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .filter((paragraph) => paragraph.trim().length > 0)
}

function Story({ world, story }: { world: PublicUniverse; story: PublicStoryDetail }) {
  useDocumentTitle(story.title, world.name)
  const owner = useWorkspaceLink(world.slug, { story: story.slug })
  const sections = [
    story.manuscript.length > 0 ? { id: 'manuscript', label: 'Manuscript' } : null,
    story.scenes.length > 0 ? { id: 'scenes', label: 'Scenes' } : null,
    story.plot.length > 0 ? { id: 'plot', label: 'Plot' } : null,
  ].filter((section) => section !== null)

  return (
    <article className="pread pstory" data-testid="public-story">
      <nav className="pcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link
              className="pcrumbs__back"
              to={worldPath(world.slug)}
              data-testid="public-story-world"
            >
              <ArrowLeft aria-hidden="true" size={16} strokeWidth={1.75} />
              <bdi>{world.name}</bdi>
            </Link>
          </li>
          <li aria-current="page">Stories</li>
        </ol>
      </nav>

      <header className="pread__head pstory__head">
        <p className="pread__eyebrow">A story</p>
        <h1 className="pread__title pstory__title" dir="auto">
          <bdi>{story.title}</bdi>
        </h1>
        <WorldAttribution
          world={world}
          className="pstory__byline"
          testId="public-story"
          after={
            <>
              <span aria-hidden="true"> · </span>
              <span>Published {formatDate(story.publishedAt)}</span>
            </>
          }
        />
        <p className="pstory__summary" dir="auto" data-testid="public-story-summary">
          {story.publicSummary}
        </p>
        {owner?.storyId ? (
          <Link
            className="pread__edit"
            to={`/app/universes/${owner.universeId}/stories/${owner.storyId}`}
            data-testid="edit-in-workspace"
          >
            Edit in workspace
            <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.75} />
          </Link>
        ) : null}
        {sections.length > 1 ? (
          <nav className="pstory__sections" aria-label="In this story">
            <ul>
              {sections.map((section) => (
                <li key={section.id}>
                  <a className="portal__pill" href={`#${section.id}`}>
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>

      {story.manuscript.length > 0 ? (
        <section
          className="pstory__section"
          id="manuscript"
          aria-labelledby="pstory-manuscript"
          data-testid="public-story-manuscript"
        >
          <h2 className="pstory__heading" id="pstory-manuscript">
            Manuscript
          </h2>
          {story.manuscript.length > 1 ? (
            <nav className="pstory__toc" aria-label="Manuscript contents">
              <ol>
                {story.manuscript.map((part, index) => (
                  <li key={index}>
                    <a className="plink" href={`#part-${index + 1}`}>
                      <bdi>{part.title}</bdi>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          {story.manuscript.map((part, index) => (
            <section
              className="pstory__part"
              id={`part-${index + 1}`}
              aria-labelledby={`part-${index + 1}-title`}
              key={index}
              data-testid="public-story-part"
            >
              <h3 className="pstory__parttitle" id={`part-${index + 1}-title`} dir="auto">
                <bdi>{part.title}</bdi>
              </h3>
              <div className="pstory__prose">
                {paragraphs(part.text).map((paragraph, at) => (
                  <p key={at}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      {story.scenes.length > 0 ? (
        <section
          className="pstory__section"
          id="scenes"
          aria-labelledby="pstory-scenes"
          data-testid="public-story-scenes"
        >
          <h2 className="pstory__heading" id="pstory-scenes">
            Scenes
          </h2>
          <ol className="pstory__scenes">
            {story.scenes.map((scene, index) => (
              <li className="pstory__scene" key={index} data-testid="public-story-scene">
                <h3 className="pstory__scenetitle" dir="auto">
                  <bdi>{scene.title}</bdi>
                </h3>
                {scene.summary ? (
                  <p className="pstory__scenesummary" dir="auto">
                    {scene.summary}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {story.plot.length > 0 ? (
        <section
          className="pstory__section"
          id="plot"
          aria-labelledby="pstory-plot"
          data-testid="public-story-plot"
        >
          <h2 className="pstory__heading" id="pstory-plot">
            Plot
          </h2>
          {story.plot.map((arc, index) => (
            <section
              className="pstory__arc"
              aria-labelledby={`arc-${index + 1}-title`}
              key={index}
              data-testid="public-story-arc"
            >
              <h3 className="pstory__arctitle" id={`arc-${index + 1}-title`} dir="auto">
                <bdi>{arc.title}</bdi>
              </h3>
              {arc.description ? (
                <p className="pstory__arcdescription" dir="auto">
                  {arc.description}
                </p>
              ) : null}
              {arc.beats.length > 0 ? (
                <ol className="pstory__beats">
                  {arc.beats.map((beat, at) => (
                    <li key={at}>
                      <span className="pstory__beattitle" dir="auto">
                        <bdi>{beat.title}</bdi>
                      </span>
                      {beat.description ? (
                        <span className="pstory__beatdescription" dir="auto">
                          {beat.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          ))}
        </section>
      ) : null}

      <aside className="pstory__world" aria-label="The world of this story">
        <img
          className="pstory__worldart"
          src={world.cardImageUrl}
          alt=""
          width={960}
          height={600}
          loading="lazy"
          decoding="async"
        />
        <div className="pstory__worldtext">
          <p className="pread__eyebrow">Set in</p>
          <p className="pstory__worldname" dir="auto">
            <bdi>{world.name}</bdi>
          </p>
          <p className="pstory__worldsummary" dir="auto">
            {world.publicSummary}
          </p>
          <Link className="portal__pill" to={worldPath(world.slug)}>
            Explore this world
          </Link>
        </div>
      </aside>
    </article>
  )
}
