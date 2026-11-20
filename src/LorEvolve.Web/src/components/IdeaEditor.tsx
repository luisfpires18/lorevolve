import { useId, type ReactNode } from 'react'
import { IdeaReferencePicker } from './IdeaReferencePicker'
import { IdeaFormFields } from './ideas/IdeaFormFields'
import { IdeaHead } from './ideas/IdeaHead'
import { IdeaNotices } from './ideas/IdeaNotices'
import { IdeaReferences } from './ideas/IdeaReferences'
import { IdeaSaveBar } from './ideas/IdeaSaveBar'
import { IdeaUnavailable } from './ideas/IdeaUnavailable'
import { ideaActions } from '../ideas/ideaActions'
import type { IdeaDetail } from '../ideas/types'
import { useIdeaDraft } from '../ideas/useIdeaDraft'
import { useIdeaRead } from '../ideas/useIdeaRead'
import { useIdeaSave } from '../ideas/useIdeaSave'
import { useIdeaState } from '../ideas/useIdeaState'
import { useLeaveGuard } from '../lib/leaveGuard'
import { useI18n } from '../i18n'
import { Announce } from './Announce'

interface IdeaEditorProps {
  /** The idea being edited, or null for a new one. */
  ideaId: string | null
  /** The universe a new idea starts in - the one it was started from - or null. */
  defaultUniverseId: string | null
  /**
   * The universe this screen is inside, if any. Only its ideas open here: another idea named by the address shows nothing of
   * itself and points to all ideas, and one moved out while open says so.
   */
  contextUniverse: { id: string; name: string } | null
  /** Where this idea's list is, for the way back. */
  listPath: string
  listLabel: ReactNode
  onCreated: (idea: IdeaDetail) => void
  onDeleted: (idea: { id: string; title: string }) => void
}

/**
 * One idea: a title, a plain-text body, an optional universe and, while it has one, optional references to that
 * universe's lore and stories. The same editor for a new idea and an existing one, globally and inside a universe.
 *
 * An idea is not lore. Nothing saved here changes an entry, a story, Canon or the timeline, and the screen never offers
 * to turn it into any of them.
 *
 * Saving is explicit: Save, or Ctrl+S / Cmd+S. The idea is unsaved until the API confirms it, so a failed save changes
 * nothing on screen. A save over an idea saved from another tab or device since this one opened is refused, and the author
 * chooses: keep this version, or load that one. While anything is unsaved, following a link, signing out, the browser's
 * Back and Forward and leaving the page all ask first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere (ADR 0029, ADR 0030). If an idea
 * opens with a copy that differs from what is saved, the saved idea stays in the form, held, until the author recovers the
 * copy or discards it.
 *
 * Changing the universe while the idea references things asks first, and takes the references out of the unsaved idea in
 * plain sight: references stay inside one universe, and the change is only kept once it is saved.
 */
export function IdeaEditor({
  ideaId,
  defaultUniverseId,
  contextUniverse,
  listPath,
  listLabel,
  onCreated,
  onDeleted,
}: IdeaEditorProps) {
  const { t, tn, tx } = useI18n()
  const headingId = useId()
  const titleId = useId()
  const bodyId = useId()
  const universeFieldId = useId()
  const referencesId = useId()
  const statusId = useId()
  const recoveryId = useId()

  const base = useIdeaState({ ideaId, defaultUniverseId, contextUniverse })
  const {
    isNew,
    failed,
    discard,
    load,
    stored,
    draft,
    universes,
    isSaving,
    saves,
    failure,
    fieldErrors,
    conflict,
    isPicking,
    setIsPicking,
    announcement,
    titleInput,
    addButton,
  } = base
  useIdeaRead({ ...base, ideaId, t })
  const drafting = useIdeaDraft(base)
  const { isDirty, isTooLong, copy, offer, isHeld } = drafting

  const name = draft.title.trim() || stored.title || t('ideas.editor.thisIdea')
  useLeaveGuard(isDirty ? t('ideas.editor.leaveGuard', { name }) : null, discard)

  const saving = useIdeaSave({ ...base, ...drafting, ideaId, onCreated, t })
  const { edit, save } = saving

  const {
    reread,
    loadSavedVersion,
    recoverDraft,
    discardDraft,
    changeUniverse,
    addReference,
    removeReference,
    remove,
  } = ideaActions({ ...base, ...drafting, ...saving, ideaId, onDeleted, t, tn, tx })

  if (load.kind !== 'ready') {
    return (
      <IdeaUnavailable
        load={load}
        listPath={listPath}
        listLabel={listLabel}
        contextUniverse={contextUniverse}
        reread={reread}
      />
    )
  }

  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)

  return (
    <article className="idea" aria-labelledby={headingId} data-testid="idea-editor">
      <IdeaHead
        listPath={listPath}
        listLabel={listLabel}
        headingId={headingId}
        isNew={isNew}
        stored={stored}
        isSaving={isSaving}
        remove={remove}
        contextUniverse={contextUniverse}
        ideaId={ideaId}
      />

      <IdeaNotices
        offer={offer}
        copy={copy}
        recoveryId={recoveryId}
        isNew={isNew}
        stored={stored}
        recoverDraft={recoverDraft}
        discardDraft={discardDraft}
        conflict={conflict}
        isSaving={isSaving}
        save={save}
        loadSavedVersion={loadSavedVersion}
        failure={failure}
      />

      <form
        className="idea__form"
        onSubmit={(event) => {
          event.preventDefault()
          void save(stored.updatedAt)
        }}
        aria-describedby={offer ? recoveryId : undefined}
      >
        <IdeaFormFields
          titleId={titleId}
          bodyId={bodyId}
          universeFieldId={universeFieldId}
          fieldErrors={fieldErrors}
          titleInput={titleInput}
          draft={draft}
          isHeld={isHeld}
          edit={edit}
          isTooLong={isTooLong}
          changeUniverse={changeUniverse}
          chosenUniverse={chosenUniverse}
          universes={universes}
        />

        <IdeaReferences
          referencesId={referencesId}
          draft={draft}
          isHeld={isHeld}
          removeReference={removeReference}
          addButton={addButton}
          setIsPicking={setIsPicking}
          fieldErrors={fieldErrors}
        />

        <IdeaSaveBar
          failed={failed}
          isDirty={isDirty}
          isNew={isNew}
          isSaving={isSaving}
          isTooLong={isTooLong}
          isHeld={isHeld}
          saves={saves}
          stored={stored}
          statusId={statusId}
        />
      </form>

      {isPicking && draft.universeId !== null ? (
        <IdeaReferencePicker
          universeId={draft.universeId}
          universeName={chosenUniverse?.name ?? null}
          chosen={draft.references}
          onChoose={addReference}
          onClose={() => setIsPicking(false)}
        />
      ) : null}

      <Announce testId="idea-announcer">{announcement}</Announce>
    </article>
  )
}
