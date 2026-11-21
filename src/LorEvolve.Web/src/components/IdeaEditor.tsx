import { useId, type ReactNode } from 'react'
import { SearchPickDrawer } from './SearchPickDrawer'
import { Quoted } from './NameList'
import { listReferenceTargets, referenceContext } from '../ideas/api'
import { IdeaFormFields } from './ideas/IdeaFormFields'
import { IdeaHead } from './ideas/IdeaHead'
import { EditorNotices } from './EditorNotices'
import { QuietNote } from './QuietNote'
import { IdeaReferences } from './ideas/IdeaReferences'
import { EditorSaveBar } from './EditorSaveBar'
import { RecordUnavailable } from './ideas/RecordUnavailable'
import {
  IDEA_REFERENCE_KIND_KEYS,
  IDEA_REFERENCE_KIND_LABELS,
  IDEA_REFERENCE_KIND_PLACEHOLDERS,
  IDEA_REFERENCE_KINDS,
  IdeaReferenceKind,
  type IdeaDetail,
} from '../ideas/types'
import { useIdeaEditor } from '../ideas/useIdeaEditor'
import { useI18n } from '../i18n'
import { Announce } from './Announce'
import { DocumentHead } from './DocumentHead'

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
  const { t, tx } = useI18n()
  const headingId = useId()
  const titleId = useId()
  const bodyId = useId()
  const universeFieldId = useId()
  const referencesId = useId()
  const statusId = useId()
  const recoveryId = useId()

  const {
    isNew,
    failed,
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
    isDirty,
    isTooLong,
    copy,
    offer,
    isHeld,
    edit,
    save,
    reread,
    loadSavedVersion,
    recoverDraft,
    discardDraft,
    changeUniverse,
    addReference,
    removeReference,
    remove,
  } = useIdeaEditor({ ideaId, defaultUniverseId, contextUniverse, onCreated, onDeleted })

  if (load.kind !== 'ready') {
    return (
      <RecordUnavailable
        load={load}
        testIdPrefix="idea"
        words="ideas.editor"
        listPath={listPath}
        contextUniverse={contextUniverse}
        elsewhere={{ open: t('ideas.editor.openInAll'), back: listLabel }}
        reread={reread}
      />
    )
  }

  const pickIn = draft.universeId
  const chosenUniverse =
    universes?.find((universe) => universe.id === draft.universeId) ??
    (stored.universe && stored.universe.id === draft.universeId ? stored.universe : null)

  return (
    <article className="idea" aria-labelledby={headingId} data-testid="idea-editor">
      <DocumentHead
        testIdPrefix="idea"
        listPath={listPath}
        listLabel={listLabel}
        isNew={isNew}
        title={stored.title}
        newTitle={t('ideas.editor.newIdea')}
        menuLabel={t('ideas.editor.moreActions', { title: stored.title })}
        deleteLabel={t('ideas.editor.deleteIdea')}
        onDelete={() => void remove()}
        busy={isSaving}
        titleId={headingId}
        lede={t('ideas.editor.lede')}
        lastSavedKey="ideas.editor.lastSaved"
        updatedAt={stored.updatedAt}
      >
        <IdeaHead isNew={isNew} stored={stored} contextUniverse={contextUniverse} ideaId={ideaId} />
      </DocumentHead>

      <EditorNotices
        testId="idea"
        recoveryId={recoveryId}
        recovery={
          offer && copy
            ? {
                what: isNew ? t('ideas.editor.recoveryNew') : t('ideas.editor.recoveryThis'),
                draft: offer,
                savedUpdatedAt: stored.updatedAt,
                preview: (
                  <div
                    className="recovery__prose idea__preview prose"
                    role="region"
                    aria-label={t('ideas.editor.recoveredDraft')}
                    tabIndex={0}
                  >
                    <p className="idea__previewtitle">{copy.title || t('ideas.editor.untitled')}</p>
                    {copy.body === '' ? (
                      <QuietNote size="body">{t('ideas.editor.noBody')}</QuietNote>
                    ) : (
                      copy.body
                    )}
                  </div>
                ),
                onRecover: recoverDraft,
                onDiscard: discardDraft,
              }
            : null
        }
        conflict={
          conflict
            ? {
                text: t('ideas.editor.conflict.text'),
                onKeepMine: () => void save(conflict.updatedAt),
                keepLabel: t('ideas.editor.conflict.keepMine'),
                onLoadSaved: loadSavedVersion,
                loadLabel: t('ideas.editor.conflict.loadSaved'),
                busy: isSaving,
              }
            : null
        }
        failure={failure}
        failureClassName="idea__failure"
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

        <EditorSaveBar
          record
          keyShortcuts
          warning={
            failed && isDirty
              ? { text: t('ideas.editor.recoveryWarning'), testId: 'idea-recovery-warning' }
              : null
          }
          save={{
            label: isNew ? t('ideas.editor.create') : t('ideas.editor.save'),
            isDirty,
            isSaving,
            isBlocked: isTooLong || isHeld,
            saves,
            restingStatus:
              stored.updatedAt === null ? t('ideas.editor.notSavedYet') : t('ideas.editor.saved'),
            statusId,
            statusTestId: 'idea-status',
            testId: 'idea-save',
          }}
        />
      </form>

      {isPicking && pickIn !== null ? (
        <SearchPickDrawer
          testId="idea-reference-picker"
          testPrefix="idea-picker"
          eyebrow={
            chosenUniverse?.name
              ? tx('ideas.picker.inUniverse', { universe: <Quoted text={chosenUniverse.name} /> })
              : t('ideas.picker.inThisUniverse')
          }
          title={t('ideas.picker.title')}
          searchLabel={t('ideas.picker.findByName')}
          narrow={{
            label: t('ideas.picker.whatToReference'),
            initial: IdeaReferenceKind.Entity,
            options: IDEA_REFERENCE_KINDS.map((kind) => ({
              value: kind,
              label: IDEA_REFERENCE_KIND_LABELS[kind],
              testId: `idea-picker-kind-${IDEA_REFERENCE_KIND_KEYS[kind]}`,
            })),
          }}
          placeholder={(kind) => t(IDEA_REFERENCE_KIND_PLACEHOLDERS[kind!])}
          search={(words, kind, signal) => listReferenceTargets(pickIn, kind!, words, signal)}
          option={(target) => ({
            key: `${target.kind}:${target.id}`,
            name: target.name,
            context: referenceContext(target),
          })}
          chosen={new Set(draft.references.map((chosen) => `${chosen.kind}:${chosen.id}`))}
          onChoose={addReference}
          onClose={() => setIsPicking(false)}
          words={{
            looking: t('ideas.picker.looking'),
            failed: t('ideas.picker.loadFailed'),
            empty: { named: t('ideas.picker.emptyNamed'), none: t('ideas.picker.emptyKind') },
            add: t('ideas.picker.add'),
            done: t('ideas.picker.added'),
          }}
        />
      ) : null}

      <Announce testId="idea-announcer">{announcement}</Announce>
    </article>
  )
}
