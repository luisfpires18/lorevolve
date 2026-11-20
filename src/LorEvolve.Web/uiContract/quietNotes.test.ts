// Run with `node --test uiContract/quietNotes.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the quiet lines on their shared part (#456): QuietNote draws a settings note and a "saved" line, so no file
// writes `settings__note` or `settings__saved`. `entry__blank`, `projectcard__meta` and a hint outside a Field
// (`field__hint`) still have hand-written copies; the lists below only shrink, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, webRoot } from './support.ts'

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// A class string with the token: a plain class, a ternary branch or a template literal. The mark `literals()`
// puts for `${...}` is split off, so "settings__note ${x}" still counts.
const writes = (source: string, token: string) =>
  classStrings(source).some((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).includes(token),
  )

test('the quiet note guard catches a hand-written line, template-built classes included', () => {
  assert.ok(writes('<p className="settings__note">{m}</p>', 'settings__note'))
  assert.ok(writes('<p className="settings__saved extra">{m}</p>', 'settings__saved'))
  assert.ok(writes('<p className={`settings__note ${extra}`}>{m}</p>', 'settings__note'))
  assert.ok(writes("<p className={ok ? 'muted' : 'settings__saved'}>{m}</p>", 'settings__saved'))
  assert.ok(!writes('<QuietNote spacing="block">{m}</QuietNote>', 'settings__note'))
  assert.ok(!writes('<p className="settings__notes">{m}</p>', 'settings__note'))
})

test('a settings note and a saved line are drawn by QuietNote', () => {
  for (const token of ['settings__note', 'settings__saved']) {
    assert.deepEqual(
      codeFiles.filter((file) => writes(read(file), token)),
      [],
      `use <QuietNote spacing="block"> or <QuietNote tone="saved"> from components/QuietNote (${token})`,
    )
  }
})

// Still hand-written; a later stage of #456 moves them.
const ENTRY_BLANK = [
  'src/components/EntityArticle.tsx',
  'src/components/ideas/IdeaNotices.tsx',
  'src/components/lore/ArticleEditing.tsx',
  'src/components/lore/ArticleHistory.tsx',
  'src/components/lore/LoreContextDrawer.tsx',
  'src/components/lore/LorePreview.tsx',
  'src/components/lore/PrivateNoteConflict.tsx',
  'src/components/projectEntities/ScriptPartFields.tsx',
  'src/components/stories/ManuscriptBody.tsx',
  'src/components/stories/ManuscriptNotices.tsx',
  'src/components/stories/ManuscriptRevision.tsx',
]

const PROJECT_CARD_META = [
  'src/components/ChapterPages.tsx',
  'src/components/ComicCollections.tsx',
  'src/components/PickOneDrawer.tsx',
  'src/components/ProjectCard.tsx',
  'src/components/ProjectEntityDetailView.tsx',
  'src/components/ProjectEntityFields.tsx',
  'src/components/ProjectOutline.tsx',
  'src/components/ProjectSchema.tsx',
  'src/components/ProjectScript.tsx',
  'src/components/ProjectSeasons.tsx',
  'src/components/TypeTemplates.tsx',
  'src/components/projectEntities/PagePanels.tsx',
  'src/components/projectEntities/SchemaTypeFields.tsx',
  'src/components/projectEntities/ScriptEditor.tsx',
  'src/components/projectEntities/ScriptPart.tsx',
  'src/components/projects/SagaSection.tsx',
  'src/components/projects/SagasUnassigned.tsx',
  'src/components/typeTemplates/TemplateFields.tsx',
]

// A hint outside a Field. Field.tsx and CheckField.tsx draw `field__hint` for good.
const FIELD_HINT = [
  'src/components/CharCount.tsx',
  'src/components/EraRelations.tsx',
  'src/components/FamilyKindDialog.tsx',
  'src/components/FamilyLinkForm.tsx',
  'src/components/FeedbackButton.tsx',
  'src/components/FieldSectionsDialog.tsx',
  'src/components/MapForm.tsx',
  'src/components/MapFormPicture.tsx',
  'src/components/MapFormReplace.tsx',
  'src/components/MapPinForm.tsx',
  'src/components/MomentPick.tsx',
  'src/components/PublicDetailsForm.tsx',
  'src/components/QuickCreateDialog.tsx',
  'src/components/SystemMachineTry.tsx',
  'src/components/TypeGroupsField.tsx',
  'src/components/UniverseArtworkField.tsx',
  'src/components/UniverseColourField.tsx',
  'src/components/WorldRuleCheckSection.tsx',
  'src/components/canon/CanonControls.tsx',
  'src/components/ideas/BoardInspector.tsx',
  'src/components/ideas/BoardToolbar.tsx',
  'src/components/ideas/IdeaReferences.tsx',
  'src/components/lore/MassCreateDefaults.tsx',
  'src/components/publishing/PublicAttributionField.tsx',
  'src/components/publishing/PublishStatus.tsx',
  'src/components/relationships/KindFormCanon.tsx',
  'src/components/relationships/KindFormFamily.tsx',
  'src/components/relationships/RelationsWhen.tsx',
  'src/components/stories/SceneFormFields.tsx',
  'src/components/timeline/MomentDating.tsx',
  'src/components/timeline/MomentDetails.tsx',
  'src/components/universes/InviteForm.tsx',
  'src/components/worldLogic/MachineTransitions.tsx',
  'src/pages/ChronologyPage.tsx',
  'src/components/Field.tsx',
  'src/components/CheckField.tsx',
]

test('the other quiet lines only stay where the list says', () => {
  const lists: Record<string, string[]> = {
    entry__blank: ENTRY_BLANK,
    projectcard__meta: PROJECT_CARD_META,
    field__hint: FIELD_HINT,
  }
  for (const [token, allowed] of Object.entries(lists)) {
    const found = codeFiles.filter((file) => writes(read(file), token))
    assert.deepEqual(
      found.filter((file) => !allowed.includes(file)),
      [],
      `${token}: use QuietNote, or Field hint under a control`,
    )
    assert.deepEqual(
      allowed.filter((file) => !found.includes(file)),
      [],
      `${token}: stale allowlist entry, remove it`,
    )
  }
})
