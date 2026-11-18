import { Check, FilePenLine, X } from 'lucide-react'
import { confirmAction } from '../../lib/confirm'
import { useI18n } from '../../i18n'
import type { RefObject } from 'react'
import { Button } from '../Button'

/** The form's bar: what state the form is in, Save or Send, and Cancel. */
export function EntryFormBar({
  isNew,
  suggesting,
  isSaving,
  saveButton,
  isDirty,
  discard,
  save,
}: {
  isNew: boolean
  suggesting: boolean
  isSaving: boolean
  saveButton: RefObject<HTMLButtonElement | null>
  isDirty: boolean
  discard: () => void
  save: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <footer className="entry__actions actionbar">
      <p className="actionbar__status" role="status" data-testid="entry-form-status">
        {isDirty
          ? suggesting
            ? t('entity.page.bar.notSent')
            : t('entity.page.bar.unsaved')
          : isNew
            ? t('entity.page.bar.newEntry')
            : t('entity.page.bar.noChanges')}
      </p>
      <div className="actionbar__actions">
        <Button
          icon={suggesting ? FilePenLine : Check}
          ref={saveButton}
          onClick={save}
          disabled={isSaving || (suggesting && !isDirty)}
          aria-busy={isSaving}
          data-testid="save-entity"
        >
          {suggesting
            ? isSaving
              ? t('entity.page.bar.sending')
              : t('entity.page.bar.send')
            : isSaving
              ? t('entity.page.bar.saving')
              : isNew
                ? t('entity.page.bar.create')
                : t('entity.page.bar.save')}
        </Button>
        {!isNew ? (
          <Button
            tone="secondary"
            icon={X}
            onClick={async () => {
              // Cancel is the choice to discard, so it asks once, and only when there is something to lose.
              if (
                isDirty &&
                !(await confirmAction({
                  title: suggesting
                    ? t('entity.page.bar.closeSuggestion.title')
                    : t('entity.page.bar.closeEdit.title'),
                  message: suggesting
                    ? t('entity.page.bar.closeSuggestion.message')
                    : t('entity.page.bar.closeEdit.message'),
                  confirmLabel: suggesting
                    ? t('entity.page.bar.closeSuggestion.confirm')
                    : t('entity.page.bar.closeEdit.confirm'),
                  cancelLabel: t('entity.page.bar.keepEditing'),
                  variant: 'destructive',
                }))
              ) {
                return
              }
              discard()
            }}
            data-testid="cancel-entity"
          >
            {t('entity.page.bar.cancel')}
          </Button>
        ) : null}
      </div>
    </footer>
  )
}
