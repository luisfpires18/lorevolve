import { t } from '../../i18n'

/** The banner a save refused as stale shows: keep this version, or load the saved one. */
export function WorldRuleConflict({
  conflict,
  isSaving,
  save,
  loadSavedVersion,
}: {
  conflict: { updatedAt: string | null }
  isSaving: boolean
  save: (expectedUpdatedAt: string | null) => Promise<void>
  loadSavedVersion: () => Promise<void>
}) {
  return (
    <div className="manuscript__conflict" role="alert" data-testid="world-rule-conflict">
      <p className="manuscript__conflicttext">{t('canon.editor.conflict')}</p>
      <div className="manuscript__conflictactions">
        <button
          className="button button--secondary"
          type="button"
          disabled={isSaving}
          onClick={() => void save(conflict.updatedAt)}
          data-testid="world-rule-keep-mine"
        >
          {t('canon.editor.keepMine')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={isSaving}
          onClick={loadSavedVersion}
          data-testid="world-rule-load-saved"
        >
          {t('canon.editor.loadSaved')}
        </button>
      </div>
    </div>
  )
}
