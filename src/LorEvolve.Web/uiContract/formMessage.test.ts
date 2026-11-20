// Run with `node --test uiContract/formMessage.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the red line under a form on its shared part (#456): FormMessage draws the `form__message`
// paragraph, so no other file writes that class. The lists below only shrink, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, webRoot } from './support.ts'

// The public pages that keep their own line for good: the portal and the auth pages are not touched.
const PUBLIC_PAGES = [
  'src/pages/InvitationPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/RegisterPage.tsx',
  'src/pages/ResetPasswordPage.tsx',
]

// Files still to move to FormMessage, one stage at a time (#456 stage 3 takes these).
const TO_MOVE = [
  'src/components/ChapterForm.tsx',
  'src/components/ChapterPages.tsx',
  'src/components/CinemaSagas.tsx',
  'src/components/ComicCollections.tsx',
  'src/components/ComicPageEditor.tsx',
  'src/components/CommentsDrawer.tsx',
  'src/components/ConnectToAi.tsx',
  'src/components/ConnectedApps.tsx',
  'src/components/CropperProgress.tsx',
  'src/components/FeedbackButton.tsx',
  'src/components/IdeaBoardPicker.tsx',
  'src/components/IdeaReferencePicker.tsx',
  'src/components/InlineConfirm.tsx',
  'src/components/ManuscriptHistory.tsx',
  'src/components/NameSummaryDrawer.tsx',
  'src/components/PickOneDrawer.tsx',
  'src/components/PlotArcForm.tsx',
  'src/components/ProfileAvatar.tsx',
  'src/components/ProjectEntitiesView.tsx',
  'src/components/ProjectEntityFields.tsx',
  'src/components/ProjectEntries.tsx',
  'src/components/ProjectOutline.tsx',
  'src/components/ProjectSchema.tsx',
  'src/components/ProjectScript.tsx',
  'src/components/ProjectSeasons.tsx',
  'src/components/PublicAuthorSection.tsx',
  'src/components/PublicDetailsForm.tsx',
  'src/components/PublicNameForm.tsx',
  'src/components/RestoreBackup.tsx',
  'src/components/ReviewSuggestions.tsx',
  'src/components/SceneForm.tsx',
  'src/components/StoryForm.tsx',
  'src/components/StoryPublicSummaryForm.tsx',
  'src/components/UniverseArtworkField.tsx',
  'src/components/UniverseForm.tsx',
  'src/components/admin/DatabaseBackups.tsx',
  'src/components/admin/SignUpLink.tsx',
  'src/components/aiChanges/AiChangeNotices.tsx',
  'src/components/aiChanges/ChangeDetails.tsx',
  'src/components/aiChanges/EditChange.tsx',
  'src/components/aiChanges/MediaChange.tsx',
  'src/components/backups/RestoreReadyForm.tsx',
  'src/components/ideas/BoardNotices.tsx',
  'src/components/ideas/IdeaNotices.tsx',
  'src/components/projectEntities/NodeEditor.tsx',
  'src/components/projectEntities/ScriptEditor.tsx',
  'src/components/projectEntities/ScriptPart.tsx',
  'src/components/projectEntities/ScriptPartNotices.tsx',
  'src/components/publishing/PublishEverything.tsx',
  'src/components/stories/ManuscriptNotices.tsx',
  'src/components/stories/StoryScenes.tsx',
  'src/components/universes/InvitationRow.tsx',
  'src/components/universes/InviteForm.tsx',
  'src/components/universes/MemberRow.tsx',
  'src/components/universes/SettingsData.tsx',
  'src/pages/CategoryShelfPage.tsx',
  'src/pages/StoriesPage.tsx',
  'src/pages/UniverseSettings.tsx',
]

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// A class string with the `form__message` token: a plain class, a ternary branch or a template literal.
// The mark `literals()` puts for `${...}` is split off, so "form__message ${x}" still counts.
const handWritten = (source: string) =>
  classStrings(source).some((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).includes('form__message'),
  )

test('the form message guard catches a hand-written line, template-built classes included', () => {
  assert.ok(handWritten('<p className="form__message" role="alert">{m}</p>'))
  assert.ok(handWritten('<p className="form__message article__failure">{m}</p>'))
  assert.ok(handWritten('<p className={`form__message ${extra}`}>{m}</p>'))
  assert.ok(handWritten("<p className={ok ? 'callout' : 'form__message'}>{m}</p>"))
  assert.ok(!handWritten('<FormMessage testId="x">{m}</FormMessage>'))
  assert.ok(!handWritten('<p className="form__messages">{m}</p>'))
})

test('a form message is drawn by FormMessage', () => {
  const allowed = [...PUBLIC_PAGES, ...TO_MOVE]
  const found = codeFiles.filter(
    (file) => file !== 'src/components/FormMessage.tsx' && handWritten(read(file)),
  )
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    'use <FormMessage> from components/FormMessage',
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
})
