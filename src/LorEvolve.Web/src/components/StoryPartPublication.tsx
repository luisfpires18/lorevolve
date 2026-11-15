import { useId, useState } from 'react'
import { ChevronDown, Globe, Lock } from 'lucide-react'
import { ActionMenu } from './ActionMenu'
import { setStoryPartPublication } from '../publishing/api'
import { Visibility, type StoryPartKind, type VisibilityValue } from '../publishing/types'
import { t, useI18n } from '../i18n'

/** What each part puts on the story's public page and what it keeps - said before publishing, never discovered after. */
function wordsOf(kind: StoryPartKind) {
  if (kind === 'scene') {
    return {
      what: t('stories.publication.part.scene.what'),
      verb: t('stories.publication.part.scene.verb'),
      listed: t('stories.publication.part.scene.listed'),
      kept: t('stories.publication.part.scene.kept'),
      isPublic: t('stories.publication.part.scene.isPublic'),
    }
  }
  if (kind === 'manuscript') {
    return {
      what: t('stories.publication.part.manuscript.what'),
      verb: t('stories.publication.part.manuscript.verb'),
      listed: t('stories.publication.part.manuscript.listed'),
      kept: t('stories.publication.part.manuscript.kept'),
      isPublic: t('stories.publication.part.manuscript.isPublic'),
    }
  }
  return {
    what: t('stories.publication.part.arc.what'),
    verb: t('stories.publication.part.arc.verb'),
    listed: t('stories.publication.part.arc.listed'),
    kept: t('stories.publication.part.arc.kept'),
    isPublic: t('stories.publication.part.arc.isPublic'),
  }
}

type Shown = 'private' | 'public' | 'selected'

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
  useI18n()
  const noteId = useId()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const words = wordsOf(kind)
  const LABELS: Record<Shown, string> = {
    private: t('stories.publication.part.shown.private'),
    public: t('stories.publication.part.shown.public'),
    selected: t('stories.publication.part.shown.selected'),
  }
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
          ? t('stories.publication.part.madePrivate')
          : next.storyIsPublic
            ? t('stories.publication.part.published')
            : t('stories.publication.part.selected'),
      )
    } catch {
      setFailed(
        publish
          ? t('stories.publication.part.failedPublish')
          : t('stories.publication.part.failedPrivate'),
      )
    } finally {
      setBusy(false)
    }
  }

  const explanation =
    shown === 'public'
      ? [words.isPublic, words.listed, words.kept]
      : shown === 'selected'
        ? [t('stories.publication.part.selectedHidden'), words.kept]
        : [
            storyIsPublic
              ? t('stories.publication.part.onlyYou', { what: words.what })
              : t('stories.publication.part.onlyYouSelects', { what: words.what }),
            words.listed,
            words.kept,
          ]

  const Icon = isSelected ? Globe : Lock

  return (
    <div className="contentpub contentpub--bar partpub" data-testid={`${kind}-publication-control`}>
      <ActionMenu
        className="contentpub__menu"
        label={t('stories.publication.part.label', {
          what: words.what,
          name,
          state: LABELS[shown],
        })}
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
            {shown === 'selected' ? t('stories.publication.part.heading') : LABELS[shown]}
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
          {isSelected ? t('stories.publication.part.makePrivate') : words.verb}
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
