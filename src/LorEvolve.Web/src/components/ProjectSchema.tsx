import type { ReactNode } from 'react'
import { applyProjectTemplate, createProjectType, saveProjectType } from '../projectEntities/api'
import { EmptyState } from './EmptyState'
import { TypeDialog } from './TypeDialog'
import { TypeFromTemplateDrawer } from './TypeFromTemplateDrawer'
import { t, useI18n } from '../i18n'
import { useProjectSchema } from '../projectEntities/useProjectSchema'
import { SchemaHead } from './projectEntities/SchemaHead'
import { SchemaTypeItem } from './projectEntities/SchemaTypeItem'

/**
 * A project's own types, and the fields on them (#144).
 *
 * The starter types are offered on an empty project and never imposed: the offer says what they would be, and the
 * author may take them or make their own. Once they exist they are ordinary types, which is why edit and delete are
 * right here beside them.
 *
 * Drawn as the universe's Types screen draws its types - the same rows, the same drawer, the same fields panel - because
 * they are the same thing an author manages, only held by a project rather than the universe.
 */
export function ProjectSchema({
  projectId,
  reloadKey,
  onChanged,
  crumb,
  universeId,
  canEdit = false,
  asPage = false,
  projectName,
}: {
  projectId: string
  /**
   * Changed by the page when something outside this panel changed what it shows. An entry added beside it is one: a
   * type's entry count is part of this screen, so it has to be re-read rather than left saying "No entries yet" over
   * an entry the author just made.
   */
  reloadKey: number
  /** Called after any write, so the entries panel beside this one re-reads the types it offers. */
  onChanged?: () => void
  /** A project's own Types view (a Game): headed as the universe's Types page is, with its title and New type. */
  asPage?: boolean
  /** The project the page is for, named in the lede as the universe Types page's Gaming view names its game. */
  projectName?: string
  /** The way back to the type cards, above the panel's name, when the panel is a screen of its own. */
  crumb?: ReactNode
  /** When given, the universe's type templates are offered as a second way to make a type (#283). */
  universeId?: string
  /** Whether the reader may edit this universe's content: the template copy is offered only then. */
  canEdit?: boolean
}) {
  useI18n()
  const {
    types,
    template,
    failed,
    busy,
    setBusy,
    editing,
    setEditing,
    childOf,
    setChildOf,
    templates,
    fromTemplate,
    setFromTemplate,
    openTypeId,
    setOpenTypeId,
    addingFieldTo,
    setAddingFieldTo,
    tree,
    after,
    refresh,
    failing,
  } = useProjectSchema({ projectId, reloadKey, universeId, onChanged })

  if (types === null) {
    return <p className="projectcard__meta">{t('projects.common.loading')}</p>
  }

  const offerStarters = types.length === 0 && template !== null && template.types.length > 0

  return (
    <section className="projects" data-testid="project-schema">
      <SchemaHead
        crumb={crumb}
        canEdit={canEdit}
        asPage={asPage}
        projectName={projectName}
        setEditing={setEditing}
        setChildOf={setChildOf}
        templates={templates}
        setFromTemplate={setFromTemplate}
      />

      {fromTemplate ? (
        <TypeFromTemplateDrawer
          projectId={projectId}
          templates={templates}
          onClose={() => setFromTemplate(false)}
          onSaved={() => {
            setFromTemplate(false)
            refresh()
          }}
        />
      ) : null}

      {editing ? (
        <TypeDialog
          tree={tree}
          type={editing === 'new' ? null : editing}
          initialParent={editing === 'new' ? childOf : null}
          eyebrow={t('projects.schema.title')}
          iconHint={t('projects.schema.iconHint')}
          parentHint={t('projects.schema.parentHint')}
          write={(values) =>
            editing === 'new'
              ? createProjectType(projectId, {
                  name: values.name,
                  description: null,
                  icon: values.icon,
                  accentColor: null,
                  parentId: values.parentId,
                })
              : // The route replaces the whole type: what the drawer does not edit goes back as it is stored.
                saveProjectType(projectId, editing.id, {
                  name: values.name,
                  description: editing.description,
                  icon: values.icon,
                  accentColor: editing.accentColor,
                  parentId: values.parentId,
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
        <p role="alert" data-testid="project-schema-failed">
          {failed}
        </p>
      ) : null}

      {offerStarters ? (
        <EmptyState
          title={t('projects.schema.starterOffer', { types: template.types.join(', ') })}
          hint={t('projects.schema.starterHint')}
          action={
            <button
              className="button"
              type="button"
              disabled={busy}
              data-testid="project-schema-starters"
              onClick={() => {
                setBusy(true)
                applyProjectTemplate(projectId).then(after).catch(failing)
              }}
            >
              {busy ? t('projects.schema.starterApplying') : t('projects.schema.starterApply')}
            </button>
          }
          testId="project-schema-offer"
        />
      ) : null}

      {types.length === 0 && !offerStarters ? (
        <EmptyState
          title={t('projects.schema.empty')}
          hint={t('projects.schema.emptyHint')}
          testId="project-schema-empty"
        />
      ) : null}

      <ul className="types__list" data-testid="project-types">
        {tree.ordered.map((node) => (
          <SchemaTypeItem
            key={node.type.id}
            node={node}
            tree={tree}
            projectId={projectId}
            busy={busy}
            setBusy={setBusy}
            setEditing={setEditing}
            setChildOf={setChildOf}
            openTypeId={openTypeId}
            setOpenTypeId={setOpenTypeId}
            addingFieldTo={addingFieldTo}
            setAddingFieldTo={setAddingFieldTo}
            refresh={refresh}
            failing={failing}
          />
        ))}
      </ul>
    </section>
  )
}
