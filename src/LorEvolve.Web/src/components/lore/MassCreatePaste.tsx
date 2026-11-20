import { Field } from '../Field'
import { useI18n } from '../../i18n'
import type { useMassRows } from '../../lore/useMassRows'
import { Button } from '../Button'

type Rows = ReturnType<typeof useMassRows>

/** The paste box and Add to list. */
export function MassCreatePaste({
  id,
  draft,
  pasteMessage,
  take,
  onDraftChange,
}: Pick<Rows, 'draft' | 'pasteMessage' | 'take' | 'onDraftChange'> & { id: string }) {
  const { t } = useI18n()
  return (
    <section className="masscreate__paste">
      <Field
        as="textarea"
        label={t('lore.massCreate.pasteLabel')}
        id={`${id}-paste`}
        hint={<span className="masscreate__hint">{t('lore.massCreate.pasteHint')}</span>}
        error={
          pasteMessage ? (
            <span
              className="masscreate__pastemessage"
              role="alert"
              data-testid="mass-paste-message"
            >
              {pasteMessage}
            </span>
          ) : undefined
        }
        rows={5}
        value={draft}
        onChange={onDraftChange}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault()
            if (draft.trim()) take(draft)
          }
        }}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        autoComplete="off"
        spellCheck={false}
        data-testid="mass-paste"
        controlClassName="masscreate__pastearea"
      />
      <div>
        <Button
          tone="secondary"
          size="sm"
          onClick={() => take(draft)}
          disabled={draft.trim() === ''}
          data-testid="mass-add-text"
        >
          {t('lore.massCreate.addToList')}
        </Button>
      </div>
    </section>
  )
}
