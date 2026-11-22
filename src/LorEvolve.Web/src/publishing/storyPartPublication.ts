import { setStoryPartPublication } from './api'
import { Visibility, type StoryPartKind, type VisibilityValue } from './types'
import { t } from '../i18n'
import type { Shown } from './contentPublicationWords'

/** A story's part (ADR 0039): its own selection, and its story's state as the story page holds it. */
export interface StoryPart {
  kind: StoryPartKind
  storyId: string
  visibility: VisibilityValue
  /** Null while it is not known, when a selection is only ever called Selected. */
  storyIsPublic: boolean | null
  onChange: (visibility: VisibilityValue) => void
}

/** What each part puts on the story's public page and what it keeps - said before publishing, never discovered after. */
function partWordsOf(kind: StoryPartKind) {
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

/**
 * A part's state in words - Private; Selected, when chosen but its story is not public; Public, when anyone can read
 * it - and what its panel says. Publishing the story turns every selected part Public at once.
 */
export function partPublicationView({ kind, visibility, storyIsPublic }: StoryPart) {
  const words = partWordsOf(kind)
  const labels: Record<Shown, string> = {
    private: t('stories.publication.part.shown.private'),
    public: t('stories.publication.part.shown.public'),
    selected: t('stories.publication.part.shown.selected'),
  }
  const isSelected = visibility === Visibility.Public
  const shown: Shown = !isSelected ? 'private' : storyIsPublic ? 'public' : 'selected'
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
  return {
    words,
    labels,
    isSelected,
    shown,
    heading: shown === 'selected' ? t('stories.publication.part.heading') : labels[shown],
    explanation,
  }
}

/** A part's one handler: selecting it for its story's public page or making it private. */
export function partPublicationChange({
  universeId,
  id,
  part,
  setBusy,
  setFailed,
  setAnnouncement,
}: {
  universeId: string
  id: string
  part: StoryPart
  setBusy: (value: boolean) => void
  setFailed: (value: string | null) => void
  setAnnouncement: (value: string) => void
}) {
  async function change(publish: boolean) {
    setBusy(true)
    setFailed(null)
    setAnnouncement('')
    try {
      const next = await setStoryPartPublication(universeId, part.storyId, part.kind, id, publish)
      part.onChange(next.visibility)
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
  return change
}
