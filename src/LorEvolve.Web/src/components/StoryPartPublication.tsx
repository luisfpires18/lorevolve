import { useId, useState } from 'react'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { setStoryPartPublication } from '../publishing/api'
import { Visibility, type StoryPartKind, type VisibilityValue } from '../publishing/types'

/** What each part puts on the story's public page and what it keeps - said before publishing, never discovered after. */
const WORDS: Record<
  StoryPartKind,
  { what: string; verb: string; listed: string; kept: string; isPublic: string }
> = {
  scene: {
    what: 'scene outline',
    verb: 'Publish outline',
    listed: 'Readers see this scene’s title and summary in the story’s outline.',
    kept: 'Its notes, point of view, lore, date, beats and prose are not published by this.',
    isPublic: 'This scene’s outline is on the story’s public page.',
  },
  manuscript: {
    what: 'scene prose',
    verb: 'Publish prose',
    listed: 'Readers can read this scene’s prose, under its title, on the story’s public page.',
    kept: 'Its summary, notes and saved versions are not published by this.',
    isPublic: 'This scene’s prose is on the story’s public page.',
  },
  arc: {
    what: 'plot arc',
    verb: 'Publish arc',
    listed: 'Readers see the arc’s title and description, and its beats’ titles and descriptions.',
    kept: 'Notes and links to scenes and lore are not published. Plot often gives a story away: publish it only on purpose.',
    isPublic: 'This arc is on the story’s public page.',
  },
}

type Shown = 'private' | 'public' | 'selected'

const LABELS: Record<Shown, string> = { private: 'Private', public: 'Public', selected: 'Selected' }

/**
 * One part of a story - a scene's outline, a scene's prose, a plot arc - and its publication (ADR 0039), beside where the
 * part is written. The same pill and panel as an entry's or a story's (`ContentPublication`): the state in words -
 * Private; Selected, when chosen but its story is not public; Public, when anyone can read it - and a panel that says what
 * is published, what is not, and the one thing to do. `storyIsPublic` is the story's own state, held by the story page,
 * so publishing the story turns every selected part Public at once; null while it is not known, when a selection is only
 * ever called Selected.
 */
export function StoryPartPublication({
  universeId,
  storyId,
  kind,
  id,
  name,
  visibility,
  storyIsPublic,
  onChange,
}: {
  universeId: string
  storyId: string
  kind: StoryPartKind
  id: string
  name: string
  visibility: VisibilityValue
  storyIsPublic: boolean | null
  onChange: (visibility: VisibilityValue) => void
}) {
  const noteId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const words = WORDS[kind]
  const isSelected = visibility === Visibility.Public
  const shown: Shown = !isSelected ? 'private' : storyIsPublic ? 'public' : 'selected'

  async function change(publish: boolean) {
    setBusy(true)
    setFailed(null)
    setAnnouncement('')
    try {
      const next = await setStoryPartPublication(universeId, storyId, kind, id, publish)
      onChange(next.visibility)
      setAnnouncement(
        !publish
          ? 'Made private. It is no longer on the story’s public page.'
          : next.storyIsPublic
            ? 'Published. It is on the story’s public page.'
            : 'Selected for publication. It stays hidden until the story is public.',
      )
    } catch {
      setFailed(`It could not be ${publish ? 'published' : 'made private'}. Try again.`)
    } finally {
      setBusy(false)
    }
  }

  const explanation =
    shown === 'public'
      ? [words.isPublic, words.listed, words.kept]
      : shown === 'selected'
        ? [
            'Selected for publication, but hidden until the story is public: the story, with its public summary, in a public universe.',
            words.kept,
          ]
        : [
            storyIsPublic
              ? `Only you can see this ${words.what}.`
              : `Only you can see this ${words.what}. The story is not public yet, so publishing selects it: it stays hidden until the story is.`,
            words.listed,
            words.kept,
          ]

  const Icon = isSelected ? Globe : Lock

  return (
    <div className="contentpub contentpub--bar partpub" data-testid={`${kind}-publication-control`}>
      <ActionMenu
        className="contentpub__menu"
        label={`Publication of ${words.what} “${name}”: ${LABELS[shown]}`}
        triggerClassName={`contentpub__trigger contentpub__trigger--${shown}`}
        trigger={
          <>
            <Icon
              className="contentpub__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            <span data-testid={`${kind}-publication-state`}>{LABELS[shown]}</span>
            <ChevronDown
              className="contentpub__chevron"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
          </>
        }
        panelClassName="contentpub__panel"
        triggerTestId={`${kind}-publication`}
        panelTestId={`${kind}-publication-panel`}
      >
        <div className="actionmenu__context contentpub__context" id={noteId}>
          <p className="contentpub__heading">
            {shown === 'selected' ? 'Selected for publication' : LABELS[shown]}
            <span className="contentpub__what"> · {words.what}</span>
          </p>
          {explanation.map((line) => (
            <p className="contentpub__note" key={line}>
              {line}
            </p>
          ))}
        </div>
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          aria-describedby={noteId}
          onClick={() => void change(!isSelected)}
          data-testid={isSelected ? `unpublish-${kind}` : `publish-${kind}`}
        >
          {isSelected ? (
            <Lock
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
          ) : (
            <Globe
              className="button__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
          )}
          {isSelected ? 'Make private' : words.verb}
        </button>
      </ActionMenu>
      {failed ? (
        <span className="contentpub__error" role="alert" data-testid={`${kind}-publication-error`}>
          {failed}
        </span>
      ) : null}
      <span className="visually-hidden" role="status">
        {announcement ? (
          <>
            <bdi>{name}</bdi>: {announcement}
          </>
        ) : null}
      </span>
    </div>
  )
}
