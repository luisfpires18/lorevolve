import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  createTypeTemplate,
  deleteTypeTemplate,
  listTypeTemplates,
  saveTypeTemplate,
} from '../typeTemplates/api'
import type { TypeTemplate } from '../typeTemplates/types'
import type { ProjectField } from '../projectEntities/types'
import { buildTypeTree, type TreeType } from '../lore/typeTree'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { ActionIcon } from './ActionIcon'
import { EmptyState } from './EmptyState'
import { TypeDialog } from './TypeDialog'
import { t, useI18n } from '../i18n'
import { TemplateRow } from './typeTemplates/TemplateRow'

const NO_TYPES = buildTypeTree<TreeType>([])

/**
 * The universe's reusable types (#282). A template is its own thing: editing or deleting one never touches the types
 * of any game, because a game only ever gets a copy. The rows are the Types screen's own rows and the fields panel is
 * the project fields panel, so a template reads like a type and is managed like one.
 */
export function TypeTemplates({ universeId, canEdit }: { universeId: string; canEdit: boolean }) {
  useI18n()
  const [templates, setTemplates] = useState<TypeTemplate[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<TypeTemplate | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  // A field form is open on a template: new, or an existing field being edited.
  const [fieldForm, setFieldForm] = useState<{
    templateId: string
    field: ProjectField | null
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listTypeTemplates(universeId, controller.signal)
      .then(setTemplates)
      .catch(() => {
        if (controller.signal.aborted) return
        setTemplates([])
        setFailed(t('entityTypes.page.templates.loadFailed'))
      })
    return () => controller.abort()
  }, [universeId])

  function refresh() {
    listTypeTemplates(universeId)
      .then((read) => {
        setTemplates(read)
        setFailed(null)
      })
      .catch(() => setFailed(t('entityTypes.page.templates.loadFailed')))
      .finally(() => setBusy(false))
  }

  function failing(error: unknown) {
    setBusy(false)
    setFailed(
      error instanceof ApiError ? error.message : t('entityTypes.page.templates.actionFailed'),
    )
  }

  async function remove(template: TypeTemplate) {
    const confirmed = await confirmAction({
      title: t('entityTypes.page.templates.deleteTitle'),
      message: t('entityTypes.page.templates.deleteMessage'),
      confirmLabel: t('entityTypes.page.templates.deleteConfirm'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusy(true)
    deleteTypeTemplate(universeId, template.id).then(refresh).catch(failing)
  }

  if (templates === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  return (
    <section className="projects" data-testid="type-templates">
      {canEdit ? (
        <div className="types__context">
          <button
            className="button"
            type="button"
            data-testid="template-new"
            onClick={() => setEditing('new')}
          >
            <ActionIcon icon={Plus} />
            {t('entityTypes.page.templates.new')}
          </button>
        </div>
      ) : null}

      {editing ? (
        <TypeDialog
          tree={NO_TYPES}
          type={editing === 'new' ? null : { ...editing, parentId: null, displayOrder: 0 }}
          noParent
          eyebrow={t('entityTypes.page.templates.eyebrow')}
          nameHint={t('entityTypes.page.templates.nameHint')}
          write={(values) =>
            editing === 'new'
              ? createTypeTemplate(universeId, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  parentId: null,
                })
              : // The route replaces the whole template: what the drawer does not edit goes back as stored.
                saveTypeTemplate(universeId, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  parentId: null,
                })
          }
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}

      {failed ? (
        <p className="notice notice--error" role="alert" data-testid="type-templates-failed">
          {failed}
        </p>
      ) : null}

      {templates.length === 0 && !failed ? (
        <EmptyState
          title={t('entityTypes.page.templates.empty')}
          hint={t(
            canEdit
              ? 'entityTypes.page.templates.emptyHint'
              : 'entityTypes.page.templates.emptyHintViewer',
          )}
          testId="type-templates-empty"
        />
      ) : null}

      <ul className="types__list" data-testid="template-list">
        {templates.map((template) => (
          <TemplateRow
            key={template.id}
            universeId={universeId}
            canEdit={canEdit}
            template={template}
            busy={busy}
            setBusy={setBusy}
            setEditing={setEditing}
            openId={openId}
            setOpenId={setOpenId}
            fieldForm={fieldForm}
            setFieldForm={setFieldForm}
            refresh={refresh}
            failing={failing}
            remove={remove}
          />
        ))}
      </ul>
    </section>
  )
}
