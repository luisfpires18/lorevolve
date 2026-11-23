Issue #562 inventory, workspace only. Part of `docs/design/ui-polish-findings.md`.

# Part B: duplicated UI code

## Workspace markup that bypasses a shared component

| # | Where | Hand-rolled | Should use | Sure |
|---|---|---|---|---|
| M1 | EntityArticle.tsx:193, TypeGroupsPanel.tsx:101, search/UniverseSearchList.tsx:57 | Own empty-state div or p (`article__empty`, `typegroups__empty`, `unisearch__note`) | `EmptyState` (title, hint, action) | medium |
| M2 | ConnectedApps.tsx:92, maps/MapPinList.tsx:28, UniverseArtworkField.tsx:86, CommentsDrawer.tsx:155, ReviewSuggestions.tsx:110 | `QuietNote` with an own empty class (`connectedapps__empty`, `mapscreen__empty`, `artwork__empty`, `history__quiet`) | `EmptyState` for list/view empties; `QuietNote` is catalogued for "nothing yet" in a panel, so this may be intended | low |
| M3 | ConfirmDialog.tsx:104, Drawer.tsx:195, FamilyMemberDetails.tsx:132, ImageCropDialog.tsx:157, ImageViewer.tsx:52 | Five separate `<dialog>` elements, each with its own open/close/guard wiring and CSS block | `Drawer` / `ConfirmDialog` are the shared two; the other three are modal variants (viewer, cropper, family details) | low (different sizes and content; shared shell could exist) |
| M4 | ContentPublication.tsx:99 and :256, ShowMore.tsx:51, InlineConfirm.tsx:79, ConfirmDialog.tsx:131, NameLinker.tsx:81, CropperStage.tsx:48, EditConflict.tsx:85 and :120, CanonBlockNotice.tsx:34, RestoreBackup.tsx:53 | Own `role="alert"` line with its own class (`contentpub__error`, `showmore__error`, `trash__confirmerror`, `confirm__failure`, `recovery__text`, `cropper__status`, `editconflict__text`, `refusal`, `restore__refused`) | `FormMessage` (red line under a form) or `Callout tone="error"` / `LoadError` | medium |
| M5 | lore/EntryHeader.tsx:137, progression/EraFieldRow.tsx:87, worldLogic/Block.tsx:124 | `<p className="field__error">` written by hand | `Field` `error` prop (or `CheckField`) | medium |
| M6 | CollaboratorsPanel.tsx:70, ConnectToAi.tsx:160, QuickCreateDialog.tsx:109, CropperProgress.tsx:36, FeedbackButton.tsx:38, NameLinker.tsx:77, SaveAction.tsx:143, EditConflict.tsx:108 and :114 | `<p role="status">` with an own class (`collab__createdtitle`, `connect__status`, `quickcreate__pending`, `cropper__stagetext`, `feedbackbutton__thanks`, `recovery__text`, `recovery__warning`, `editconflict__text`) | `QuietNote role="status"` / `LoadingNote` / `Callout` | low-medium |
| M7 | FamilyTreeTypes.tsx:110, FieldInputs.tsx:159 and :234, NameLinker.tsx:94, ProgressionItemForm.tsx:147 and :192, PublicDetailsForm.tsx:178, lore/EntryCopyPanel.tsx:108, :119 and :144, lore/SectionListEditor.tsx:85 | `<label className="check"><input type="checkbox">` by hand (11 sites) | `CheckField` | medium |
| M8 | WorldRuleCheckSection.tsx:76 and :86 | `<label className="check">` around radios | `CheckField` is checkbox only; `SegmentedField` or `SegmentedControl` for a choice | low |
| M9 | 29 raw `<select>` outside Field.tsx: ChronologyPointFields.tsx:94, ScenePicks.tsx:91 and :115, ValidationTermSelect.tsx:139, lore/EntryHeader.tsx:67, lore/FieldFilterEditor.tsx:76 and :131, lore/MassCreateRow.tsx:110 and :142, lore/SectionFieldPlacer.tsx:41, progression/EraFieldRow.tsx:46, progression/EraStories.tsx:73 and :139, timeline/StoryLinks.tsx:62, universes/RoleSelect.tsx:25, worldLogic/Block.tsx:56 and :166, Compare.tsx:18, Operand.tsx:37 and :64, Query.tsx:25, :54 and :67, TypedValue.tsx:22 and :42, FieldInputs.tsx:208 and :258, CanonStatusPicker.tsx:9 | Hand-written select with its own label wiring | `Field as="select"` (supports `inline` and a hidden label) | low-medium (some are in dense rows) |
| M10 | 8 raw `<textarea>`: CommentNewForm.tsx:33, CommentThreadItem.tsx:91, FeedbackButton.tsx:138, PublicDetailsForm.tsx:123, aiChanges/EditChange.tsx:63, lore/EntryHeader.tsx:149, worldLogic/SystemDetails.tsx:96, FieldInputs.tsx:196 | Hand-written textarea | `Field as="textarea"` | low-medium |
| M11 | lore/ArticleEditing.tsx:117 (`article__bar`), lore/PrivateNoteDrawer.tsx:195 (`privatenote__bar`), FamilyDiscovery.tsx:88 (`discovery__bar`), ImageViewer.tsx:81 (`viewer__bar`) | Own bar div; `article__bar` and `manuscript__bar` (SaveBar) also have 0.92-similar CSS | `SaveBar` / `ActionBar` (and `EntryBar` for entry screens) | medium for ArticleEditing, low for the rest |
| M12 | LoreCatalog.tsx:166, LinkRow.tsx:85, familyTree/FamilyNode.tsx:87, universes/WorkspaceRail.tsx:58, pages/UniversesPage.tsx:89 | `aria-expanded` set by hand on a button | `DisclosureButton` | low-medium |
| M13 | WipBadge.tsx:7 (`wipbadge`), timeline/MomentBody.tsx:61 and :70 (`lorechip`) | Own badge or chip span | `StatusBadge`; `Token` / `TagList` | low-medium |
| M14 | Card families: CanvasCardButton.tsx:43 `boardcard`, maps/MapCard.tsx:11 `mapcard`, maps/MapPanelDetail.tsx:53 `pincard`, WorldCard.tsx:35 `worldcard`, ShelfCard.tsx:102 `shelfcard`, familyTree/DiscoveryFamilies.tsx:87 `familycard`, CardSkeleton.tsx:23 `skeletoncard` | Seven card shells beside `EntityCard` and `CatalogCard`, each with own CSS (see CSS exact groups on `.mapcard`, `.entitycard__body`, `.typecard__body`) | `CardGrid` for the grid (used by 7 files); `EntityCard` / `CatalogCard` / "Shared surfaces" for the card | low (distinct designs; confirm before merging) |
| M15 | CinemaSagas.tsx:110, ComicCollections.tsx:93, ProjectSchema.tsx:163, RelationshipTypeManager.tsx:106, TypeTemplates.tsx:111 and 8 more (13 `ul.types__list`, 21 grep hits) | The same `types__list` list shell repeated by class name | `TypeRow` / `LinkRow` / `ManageRow` inside one list component | low (class reuse, not copied markup) |
| M16 | RestoreBackup.tsx:45, pages/UniversesPage.tsx:112 | `<h2 className="composer__title">` panel heads | `PageHeader size="panel"` | low |

## Repeated CSS (workspace only)

Exact: same ctx (media/supports) and identical set of >= 4 declarations (custom properties ignored) under two or more different selectors. Near: >= 6 declarations, Jaccard >= 0.8, different files.

Exact groups: 21 (19 span 2+ files). Near pairs: 5.

## Exact groups spanning 2+ files

| Decls | Rules | Area | Where (file:line selector) | Declarations (first 3) |
|---|---|---|---|---|
| 4 | 5 | workspace | 017-universe-colour.css:7 `.colourfield__row`, 037-lore-front-page.css:8 `.lorecatalog__browse`, 040-entry-lore-article.css:22 `.entry__kind`, 049-types.css:243 `.types__head`, 119-relations-when.css:24 `.relperiod__head` | `align-items:center; display:flex; flex-wrap:wrap ...` |
| 4 | 5 | workspace | 018-controls.css:125 `.feedbackdialog fieldset`, 069-stories-3.css:1 `.scenechron`, 114-pending-ai-changes-2.css:3 `.consent__propose`, 116-entry-forms-and-abilities.css:51 `.scenepicks__group`, 122-maps-2.css:186 `.mappinform__position` | `border:0; margin:0; min-width:0 ...` |
| 4 | 4 | workspace | 035-lore-cards.css:99 `.entitycard__body`, 037-lore-front-page.css:109 `.lorecatalog__grid > li`, 038-lore-front-page-2.css:35 `.typecard__body`, 038-lore-front-page-2.css:55 `.typecard__details` | `display:flex; flex-direction:column; gap:var(--space-1) ...` |
| 4 | 3 | workspace | 020-collaborators.css:126 `.collab__controls`, 050-types-2.css:66 `.typegroups__newrow`, 124-idea-boards.css:22 `.board__connecting` | `align-items:center; display:flex; flex-wrap:wrap ...` |
| 4 | 3 | workspace | 034-lore-types-navigation.css:208 `.typemenu__current`, 035-lore-cards.css:144 `.entitycard__typename`, 037-lore-front-page.css:56 `.lorecatalog__group > bdi` | `min-width:0; overflow:hidden; text-overflow:ellipsis ...` |
| 10 | 2 | workspace | 081-ideas.css:119 `.idearow__excerpt`, 083-world-rules.css:69 `.rulerow__excerpt` | `-webkit-box-orient:vertical; -webkit-line-clamp:2; color:var(--muted) ...` |
| 6 | 2 | workspace | 050-types-2.css:52 `.typegroups__chosen`, 062-chronology.css:165 `.moment__cast` | `display:flex; flex-wrap:wrap; gap:var(--space-1) var(--space-2) ...` |
| 5 | 2 | workspace | 035-lore-cards.css:118 `.entitycard__aliases`, 038-lore-front-page-2.css:63 `.typecard__path, .typecard__meta` | `color:var(--muted); font-size:var(--text-sm); overflow:hidden ...` |
| 5 | 2 | workspace | 050-types-2.css:140 `.typegroups__row`, 057-entity-picker.css:130 `.quickcreate__matches li` | `align-items:center; display:flex; flex-wrap:wrap ...` |
| 5 | 2 | workspace | 121-maps.css:146 `.mapviewer__layer`, 124-idea-boards.css:106 `.boardcanvas__layer` | `left:0; position:absolute; top:0 ...` |
| 4 | 3 | workspace | 121-maps.css:20 `.mapcard`, 125-idea-boards-2.css:155 `.guardblock`, 125-idea-boards-2.css:206 `.guardblock__children, .guardblock__slot, .guard` | `display:flex; flex-direction:column; gap:var(--space-2) ...` |
| 4 | 2 | workspace | 042-entry-form.css:55 `.entrycopy__options`, 051-type-icon-picker.css:7 `.iconpicker` | `border:0; margin:0; min-inline-size:0 ...` |
| 4 | 2 | workspace | 044-thumbnail-cropper.css:45 `.cropper__title`, 130-shared-rows.css:132 `.panelhead__title` | `font-family:var(--display); font-size:var(--text-section); font-weight:400 ...` |
| 4 | 2 | workspace | 079-trash.css:7 `.trash__list`, 082-ideas-2.css:64 `.ideapicker__results` | `border-top:1px solid var(--rule); list-style:none; margin:0 ...` |
| 4 | 2 | workspace | 079-trash.css:81 `.trash__waiting`, 112-connect-to-ai.css:215 `.connectedapps__status` | `color:var(--ink); font-size:var(--text-sm); margin:var(--space-1) 0 0 ...` |
| 4 | 2 | workspace | 081-ideas.css:187 `.idea__form`, 083-world-rules.css:97 `.rule__form` | `display:flex; flex-direction:column; gap:1.6rem ...` |

## Exact groups inside one file only (top 25)

| Decls | Rules | Where | Declarations (first 3) |
|---|---|---|---|
| 6 | 2 | 117-entry-appearances.css:7 `.gallery`, 117-entry-appearances.css:53 `.eralooks` | `display:flex; flex-wrap:wrap; gap:var(--space-3)` |
| 5 | 2 | 122-maps-2.css:167 `.pinlist__icon`, 122-maps-2.css:236 `.entrymaps__icon` | `color:var(--muted); flex:none; height:1rem` |

## Near duplicates (top 60 by similarity then size)

| Jaccard | Decls | Rule A | Rule B | Differs in (first 3) |
|---|---|---|---|---|
| 0.92 | 12 | 046-article.css:77 `.article__bar` | 073-story-manuscript-2.css:14 `.manuscript__bar` | `max-width:calc(62ch + 2.5rem)` |
| 0.89 | 8 | 043-picture-whole.css:165 `.imagefield__input` | 067-stories.css:9 `.visually-hidden` | `border:0` |
| 0.86 | 6 | 039-lore-phone.css:99 `.lore__masscreatelabel` | 082-ideas-2.css:129 `.idearef__removelabel` | `margin:-1px` |
| 0.82 | 10 | 081-ideas.css:119 `.idearow__excerpt` | 121-maps.css:64 `.mapcard__description` | `max-width:60ch; max-width:70ch` |
| 0.82 | 10 | 083-world-rules.css:69 `.rulerow__excerpt` | 121-maps.css:64 `.mapcard__description` | `max-width:60ch; max-width:70ch` |

## Notes on `.visually-hidden`

`.visually-hidden` is defined once, in `067-stories.css:9`, though it is a global utility used across the app; `043-picture-whole.css:165 .imagefield__input` repeats its 8 declarations (all but `border:0`). Candidate home: `022-utilities.css`.

## Not measured

- Rendered pixel effect: swap verdicts are arithmetic at 16px root, not screenshots. `em` values depend on the parent size.
- CSS repeats need >= 4 identical declarations (exact) or >= 6 with Jaccard >= 0.8 (near). Three-line flex helpers and pairs of 4 to 5 declarations that differ by one value are not listed.
- Markup: only `className`-based and role-based probes in non-test `.tsx`. Hand-rolled structure with no telling class (a div grid built from inline `style`) and duplicated TypeScript logic are not covered. Confidence is from reading 3 to 5 lines at each site, not the whole component.
- Spacing off-scale values are counted on padding, margin, gap, inset, top/right/bottom/left only (not width, flex-basis, translate). Colours inside `001-foundation.css` are skipped by design.