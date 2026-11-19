# MCP capability matrix

What a connected AI app can and cannot reach, domain by domain, and which test proves it. Issue #155 (LOREX-022).

This document is checked by `tests/LorEvolve.Api.Tests/McpCapabilityMatrixTests.cs`. The tables below are compared
against a catalog written out by hand in that test, so neither can drift from the other: a new API domain fails
`Every_universe_and_project_route_falls_under_one_domain_of_the_matrix` until it is classified here, a new MCP tool
fails `Every_MCP_tool_the_server_offers_is_mapped_by_the_matrix`, and a new proposable resource fails
`Every_resource_a_proposal_may_name_is_mapped_by_the_matrix`.

## How to read it

A domain is a family of API routes, named by the route segments that follow the universe or project id with every id
dropped: `entities/comments` is the comments on a lore entry. The longest matching prefix wins, so a nested family is
classified apart from its parent.

Reading and writing are answered separately, because the MCP surface is deliberately lopsided (ADR 0046, ADR 0047):
an app reads directly and writes only through something a person then decides: a staged proposal, or a submitted
claim. A read cell holds the MCP tools that read the domain; a write cell holds the proposal resource (an
`AiChangeResource`) or the tool that writes it. Either cell may instead hold one of these codes.

| Code | What it means |
| --- | --- |
| `read-only-by-design` | A read exists; writing is never direct. The write path is `propose_changes`, or the web app. |
| `person-only` | Deliberately outside the MCP surface: the decision is a person's, never an app's. Collaborators, invitations, publishing, approving a staged change, accepting a suggestion, review comments, backups, canon findings, and deciding a finding or a submitted claim. |
| `media-bytes` | Picture bytes, not data. A lore picture is fetched by `get_lore_image`; everything else is served at its own address to a signed-in person. |
| `live-only` | An app reads what is live. History, revisions and the Trash are not on the MCP surface. |

`get_change_options` appears as the read for schema-shaped domains because that is where an app reads their real ids
before proposing against them, which is the only read of them MCP offers.

## Inside a universe

| Operations | Route prefix | Read over MCP | Write over MCP |
| --- | --- | --- | --- |
| The universe itself | `/`, `archive`, `unarchive` | `get_universe_overview` | `person-only` |
| Lore entries | `entities` | `get_lore_entry`, `search_universe` | `LoreEntry` |
| An entry's article | `entities/article` | `get_lore_entry` | `Article` |
| An entry's progression | `entities/progression` | `get_lore_entry` | `Progression` |
| An entry's pictures | `entities/image`, `entities/appearances` | `list_lore_images`, `get_lore_image` | `Media` |
| An entry's history | `entities/revisions` | `live-only` | `live-only` |
| An entry's private note | `entities/private-note` | `person-only` | `add_private_note` |
| An entry's map pins | `entities/map-pins` | `get_map_location` | `read-only-by-design` |
| Tags | `tags` | `get_lore_entry` | `read-only-by-design` |
| Lore types and their fields | `entity-types` | `get_change_options` | `LoreType`, `LoreField` |
| Semantic groups and the family tree | `entity-type-groups`, `family-tree` | `get_change_options` | `LoreGroup` |
| Relationships | `relationships`, `entities/relationships` | `get_lore_relationships` | `Relationship` |
| Relationship kinds | `relationship-types` | `get_change_options` | `RelationshipType` |
| The timeline | `timeline` | `browse_timeline`, `get_timeline_moment` | `TimelineEvent` |
| The reckoning and its calendar | `chronology` | `get_change_options` | `Chronology` |
| World Rules | `world-rules` | `get_change_options` | `WorldRule` |
| World Logic Systems and rule definitions | `systems`, `system-rules`, `world-logic/rules` | `list_systems`, `list_world_logic_rules`, `get_world_logic_rule`, `evaluate_world_logic_rule`, `get_rule_impact` | `SystemRule`, `LoreSystem` |
| A System's state machine | `systems/machine` | `get_system_machine`, `evaluate_world_logic_rule` | `SystemState`, `SystemTransition` |
| Recorded World Logic findings | `world-logic/findings` | `list_world_logic_findings`, `get_world_logic_finding` | `person-only` |
| An AI client's unverified claim | `world-logic/semantic-findings` | `person-only` | `submit_semantic_finding` |
| The rule vocabulary | `validation-terms` | `get_change_options` | `ValidationTerm` |
| Canon findings | `canon-conflicts` | `person-only` | `person-only` |
| Search | `search` | `search_universe` | `read-only-by-design` |
| Staged AI changes and their review | `ai-changes` | `person-only` | `person-only` |
| Where to connect an app | `mcp` | `get_universe_overview` | `read-only-by-design` |
| Stories | `stories` | `get_story`, `list_projects`, `get_project` | `Story` |
| Chapters | `stories/chapters` | `get_story` | `Chapter` |
| Scenes | `stories/scenes` | `get_scene` | `Scene` |
| A scene's prose | `stories/scenes/manuscript` | `read_scene_manuscript`, `search_scene_manuscript` | `Manuscript` |
| Plot arcs | `stories/plot-arcs` | `get_arc` | `PlotArc` |
| A story's cover | `stories/cover` | `media-bytes` | `media-bytes` |
| The order of the universe's projects | `projects` | `person-only` | `person-only` |
| Review comments | `entities/comments`, `stories/comments`, `stories/scenes/comments`, `comment-threads` | `person-only` | `person-only` |
| Suggested changes | `entities/suggestions`, `stories/suggestions`, `stories/scenes/suggestions`, `suggestions` | `person-only` | `person-only` |
| The Trash | `trash` | `live-only` | `live-only` |
| Publishing | `publication`, `publish`, `unpublish`, `entities/publication`, `entities/publish`, `entities/unpublish`, `stories/publication`, `stories/publish`, `stories/unpublish`, `stories/scenes/publish`, `stories/scenes/unpublish`, `stories/scenes/manuscript/publish`, `stories/scenes/manuscript/unpublish`, `stories/plot-arcs/publish`, `stories/plot-arcs/unpublish` | `person-only` | `person-only` |
| The universe's artwork | `artwork` | `media-bytes` | `media-bytes` |
| Backups and the readable export | `export` | `person-only` | `person-only` |
| What an entry knows | `knowledge` | `get_lore_entry` | `read-only-by-design` |
| Maps and their pins | `maps` | `list_maps`, `search_map_locations`, `get_map_location`, `measure_map_distance` | `read-only-by-design` |
| A map's picture | `maps/image` | `media-bytes` | `media-bytes` |
| An entry's image field pictures | `entities/field-images` | `list_lore_images`, `get_lore_image` | `media-bytes` |
| Collaborators | `collaborators` | `person-only` | `person-only` |
| Invitations | `invitations` | `person-only` | `person-only` |
| Lore references | `lore-references` | `get_lore_entry` | `read-only-by-design` |
| Type templates | `type-templates`, `type-templates/fields` | `person-only` | `person-only` |
| Cinema sagas and their phases | `cinema-sagas`, `cinema-sagas/move`, `cinema-sagas/phases`, `cinema-sagas/phases/move`, `cinema-sagas/phases/members`, `cinema-sagas/phases/members/move` | `person-only` | `person-only` |
| Comic story arcs and events | `comic-collections`, `comic-collections/move`, `comic-collections/entries`, `comic-collections/entries/move` | `person-only` | `person-only` |

## Inside a project

A project is account-owned with an optional universe link (M1). The MCP surface reaches the projects of the connected
universe only.

| Operations | Route prefix | Read over MCP | Write over MCP |
| --- | --- | --- | --- |
| A project itself | `/`, `template` | `list_projects`, `get_project`, `get_project_script` | `person-only` |
| A project's entries | `entities` | `list_project_entries`, `get_project_entry` | `ProjectEntry` |
| A project entry's history | `entities/revisions` | `live-only` | `live-only` |
| A project's own types | `entity-types` | `get_project_schema` | `ProjectType`, `ProjectField` |
| A project's structure | `seasons`, `structure`, `structure/move` | `get_project_structure` | `read-only-by-design` |
| A comic page's or panel's picture | `structure/image` | `media-bytes` | `media-bytes` |
| A project's cover | `cover` | `media-bytes` | `media-bytes` |

## The write path

Two tools are not read-only, and both of them wait for a person (ADR 0047). Neither can approve or apply anything.

`propose_changes` stages a change to the universe. Two resources it may name have no route of their own in the tables
above: `Idea`, which belongs to the universe owner's own account rather than the universe, and `Media`, which asks a
person to upload a picture on the review page because no file comes through an MCP connection.
`get_change_options` reads what the connected person's role allows and the universe's real ids, and
`get_change_proposal` reads back what happened to a proposal the same connection staged.

`submit_semantic_finding` (#154) stages something else: a claim about meaning that no typed condition can express. It
is stored as the client's own claim, marked unverified, every claim must cite the records it is about, and it never
joins the computed findings that `list_world_logic_findings` reads. It is the only write with no `AiChangeResource`,
which is why its row names the tool rather than a resource.

Both are hidden from a read-only connection and refused if called anyway: proposing is a separate permission a person
ticks at consent, never part of read.

## Tool status

Every MCP tool the server registers and every resource `propose_changes` may name, with what it does now.
`McpCapabilityMatrixTests.Every_MCP_tool_the_server_offers_has_a_status` fails when a registered tool has no row here.
A status is `implemented`, `in progress` (work open on a branch) or `missing`. Nothing is `in progress` today.

| Tool or resource | What it does | Status | Notes |
| --- | --- | --- | --- |
| `get_universe_overview` | The universe at a glance: its name and description, its stories, and how many lore entries of each type it holds. | implemented | |
| `search_universe` | Searches lore entries, stories, arcs, chapters, scenes and scene prose by keywords. | implemented | |
| `get_lore_entry` | One lore entry: type, Canon status, summary, aliases, tags, custom fields, the start of its article and its progression. | implemented | |
| `get_lore_relationships` | An entry's relationships, both directions. | implemented | |
| `list_lore_images` | An entry's pictures, its appearances' pictures and its image fields' pictures. | implemented | A project's own entry is given by its id. |
| `get_lore_image` | One lore picture, as bytes the client can show. | implemented | Also a project entry's picture and an image field's picture; the field's crop is its thumbnail. |
| `browse_timeline` | The timeline, a page at a time. | implemented | |
| `get_timeline_moment` | One timeline moment with its participants and stories. | implemented | |
| `get_story` | One story's structure: premise, status, arcs, chapters and scenes. | implemented | |
| `get_arc` | One plot arc and its chapters in reading order. | implemented | |
| `get_scene` | One scene without its prose: story, chapter, summary, notes, point of view, world date and linked lore. | implemented | |
| `read_scene_manuscript` | A scene's manuscript, in bounded chunks. | implemented | |
| `search_scene_manuscript` | Searches inside a scene's manuscript. | implemented | |
| `list_maps` | The universe's maps. | implemented | |
| `search_map_locations` | Finds map pins by their title or their lore entry's name or alias. | implemented | |
| `get_map_location` | Every map one lore entry is pinned on. | implemented | |
| `measure_map_distance` | The straight-line separation of two pins; a distance in the creator's unit only where the map has a scale. | implemented | |
| `list_projects` | The universe's projects. | implemented | |
| `get_project` | One project: name, kind, stage, subtype and summary. | implemented | |
| `get_project_schema` | A project's own types and their fields. | implemented | |
| `list_project_entries` | A project's entries, a page at a time. | implemented | |
| `get_project_entry` | One project entry with its field values and the lore entry it stands for. | implemented | |
| `get_project_structure` | How a project is laid out, in the author's order: seasons and episodes, sequences and scenes, or chapters. | implemented | |
| `get_project_script` | One episode's, scene's or chapter's script, whole. | implemented | |
| `list_world_logic_rules` | World rules and rule definitions, both kinds, a page at a time. | implemented | |
| `get_world_logic_rule` | One rule with its condition, exceptions and dependencies. | implemented | |
| `list_systems` | The Systems and the rules each references, in order. | implemented | |
| `get_system_machine` | One System's state machine: its binding, its states and its transitions with their guard rules. | implemented | Since #361. Unpaged: a machine holds at most 64 states and 256 transitions. "Try an entry" has no tool of its own; its guards are evaluated one at a time with `evaluate_world_logic_rule`. |
| `evaluate_world_logic_rule` | Runs a rule's condition over the stored lore; records nothing. | implemented | |
| `get_rule_impact` | What a change to a rule would touch. | implemented | |
| `list_world_logic_findings` | The findings the author's sweeps recorded. | implemented | |
| `get_world_logic_finding` | One recorded finding with its evidence. | implemented | |
| `submit_semantic_finding` | Stages the client's own unverified, cited claim for the author to decide. | implemented | |
| `add_private_note` | Adds text to the owner's private note on one entry; never reads, replaces or removes it. | implemented | Owner only, on a connection allowed to write. |
| `get_change_options` | What the person's role may propose, and the universe's real ids to propose against. | implemented | |
| `propose_changes` | Stages changes for a person to review in LorEvolve; never applies them. | implemented | |
| `get_change_proposal` | Reads back a proposal this connection staged and what became of each change. | implemented | |
| `propose_changes` `lore_entry` | Create, update or remove (to the Trash) a lore entry. | implemented | |
| `propose_changes` `article` | Rewrite or add to an entry's article. | implemented | No remove: empty it instead. |
| `propose_changes` `progression` | Add to or change an entry's eras, forms, abilities and appearances. | implemented | Never removes one. |
| `propose_changes` `image` | Asks the person for a picture of an entry or an appearance. | implemented | No file over MCP: the person uploads it on the review page. |
| `propose_changes` `relationship` | Create, update or remove a relationship. | implemented | |
| `propose_changes` `story` | Create, update or remove a story. | implemented | |
| `propose_changes` `chapter` | Create, update, remove or reorder chapters. | implemented | |
| `propose_changes` `scene` | Create, update, remove or reorder scenes. | implemented | |
| `propose_changes` `manuscript` | Write a scene's manuscript. | implemented | No remove: replace its text instead. |
| `propose_changes` `plot_arc` | Create, update, remove or reorder plot arcs. | implemented | |
| `propose_changes` `timeline_event` | Create, update or remove a timeline moment. | implemented | |
| `propose_changes` `world_rule` | Create, update or remove a world rule, with its optional check. | implemented | |
| `propose_changes` `idea` | The universe owner's own ideas. | implemented | Owner only. |
| `propose_changes` `project_entry` | Create, update or remove an entry of one of the universe's projects. | implemented | |
| `propose_changes` `system_rule` | Create or update a World Logic rule definition: title, description, condition, exceptions, dependencies. | implemented | Since the ADR 0072 addendum, 2026-11-15. Checked by the rule routes' own validation; an update is bound to the version read at staging. |
| `propose_changes` `system` | Create or update a World Logic System and its whole ordered rule list. | implemented | Since the ADR 0072 addendum, 2026-11-15. The list is applied as link and unlink by difference; it may name a `system_rule` of the same proposal by its ref. |
| `propose_changes` `system_state` | Create or update one state of a System's machine: name, value, whether it is initial, and on the first state the type and attribute the machine covers. | implemented | Since #361. Approval saves the machine whole through its own save and checks, under the System's current version; staging and every read check the machine with the proposal's earlier changes to it. |
| `propose_changes` `system_transition` | Create or update one transition of a System's machine: the states it joins, its label and its guard rule. | implemented | Since #361. Its states and guard may be a `system_state` or `system_rule` of the same proposal, by ref. |
| `propose_changes` `project_type` | Create or update a type of one of the universe's projects, such as a game's GameEntity, in the same proposal as its fields and entries. | implemented | No remove: a type in use cannot be deleted and there is no Trash. An entry names a new type with `typeRef`. |
| `propose_changes` `project_field` | Create or update a field on a project's type, with its choices. | implemented | No remove. An entry names a new field with `fieldRef`. Changing the kind of a field that holds values, or dropping a choice an entry uses, is refused at approval, not at staging. |
| `propose_changes` `lore_type` | Create or update a lore type. | implemented | Schema: a proposal of its own, where the connection allows schema. |
| `propose_changes` `lore_field` | Create, update or archive a field definition. | implemented | Schema. |
| `propose_changes` `lore_group` | Create or update a semantic group. | implemented | Schema. |
| `propose_changes` `relationship_kind` | Create or update a relationship kind. | implemented | Schema. |
| `propose_changes` `chronology` | Update the date periods and the calendar, written whole. | implemented | Schema. |
| `propose_changes` `event_kind` | Create or update an event kind of the world rule vocabulary. | implemented | Schema. `method` is the same resource for a method. |
| `remove` of a `system` or a `system_rule` | Delete a System or a rule definition. | missing | By design: a System delete is permanent and a rule definition has no Trash, while `remove` means the Trash. An author deletes them in LorEvolve. |
| `remove` of a `system_state` or a `system_transition` | Delete a state or a transition of a System's machine. | missing | By design: neither has a Trash, and deleting a state takes its transitions with it. An author deletes them on the machine in LorEvolve. |
| `sort` on `list_world_logic_findings` | Read the newest findings first. | missing | The route has had `sort=newest` since #209; the tool always reads the `attention` order. |
| Reading back a submitted semantic finding | See what became of a claim this client submitted. | missing | No tool reads `world-logic/semantic-findings`; deliberate for now (#209). |
| A condition naming a record the same proposal creates | Stage a `system_rule` whose condition names a lore entry or rule created in that proposal. | missing | A condition may name only records that already exist; propose the rest after the first proposal is approved. |
| `remove` of a `project_type` or a `project_field` | Delete a project's type or field. | missing | By design for now: the API refuses a type in use and a field holding values, and neither has a Trash. |
| A `project_entry` link value naming an entry the same proposal creates | Link two new entries in one proposal. | missing | The link must name an entry that already exists. |

## What is exercised, and where

| Concern | Tests |
| --- | --- |
| The tool list is exactly these tools | `McpCapabilityMatrixTests`, `McpToolTests.The_SDK_client_finds_exactly_the_read_only_tools`, `McpProposalTests`, `McpWorldLogicToolTests.Every_read_tool_is_discoverable_and_the_one_that_writes_is_not` |
| Reads, through the real transport and the official SDK client | `McpToolTests`, `McpClientInteropTests`, `McpProjectToolTests`, `McpProjectEntityToolTests`, `McpImageToolTests`, `MapGeographyTests` |
| Proposals, and that they only stage | `McpProposalTests`, `McpProjectEntityToolTests`, `McpWorldLogicProposalTests`, `McpProjectSchemaProposalTests`, `McpWorldLogicToolTests.Get_change_options_and_propose_changes_still_work_and_a_rule_is_still_proposed_through_them` |
| A submitted claim: unverified, cited, never a computed finding, refused to a read-only connection | `McpWorldLogicToolTests.A_submitted_claim_is_unverified_cited_and_never_one_of_the_computed_findings`, `McpWorldLogicToolTests.An_uncited_claim_is_refused_and_nothing_is_stored`, `McpWorldLogicToolTests.A_read_only_connection_cannot_submit_a_claim_even_by_calling_the_tool_directly`, `SemanticFindingTests` |
| World Logic read over MCP: both kinds of rule, a System's rules, an evaluation that records nothing, a rule's impact, a finding's evidence | `McpWorldLogicToolTests` |
| The approval boundary: nothing over MCP approves, and a staged change dies with its permission | `McpProposalTests.An_app_stages_a_proposal_that_waits_for_a_person_and_never_applies_itself`, `McpProposalTests.Turning_proposals_off_or_disconnecting_stops_the_tools_and_blocks_what_was_staged` |
| Permissions: scopes, roles, revocation, one universe per token | `McpScopeTests`, `McpOAuthTests`, `McpAliasTests`, `McpConnectedAppTests` |
| One universe, proved per tool: another universe's rules, findings, Systems and projects | `McpWorldLogicToolTests.Another_universe_s_rule_is_not_readable_evaluable_or_analysable`, `McpWorldLogicToolTests.Another_universe_s_rules_findings_and_systems_are_not_listed`, `McpToolTests.Ids_from_another_universe_the_Trash_or_nowhere_read_as_not_found` |
| Pagination | `McpToolTests.The_timeline_is_browsed_a_page_at_a_time`, `McpWorldLogicToolTests.The_rule_list_pages_and_reports_what_a_page_is_part_of`, `McpProjectEntityToolTests.A_project_s_entries_are_listed_a_page_at_a_time_and_read_one_by_one`, `McpToolTests.A_long_manuscript_is_read_in_bounded_chunks_that_join_back_exactly` |
| Error handling: unknown tools, bad arguments, ids that are not ids, ids of another universe or the Trash | `McpToolTests.Unknown_tools_and_bad_arguments_are_refused`, `McpToolTests.Ids_from_another_universe_the_Trash_or_nowhere_read_as_not_found` |
| MCP off entirely | `McpDisabledTests` |
| World Logic conditions, five unrelated domains plus the edge cases | `WorldLogicEvaluatorTests.Every_case_of_a_fixture_evaluates_as_the_specification_says`, `WorldLogicFixtureTests` |

The permission side of every route above, for every role, is `UniverseAccessMatrixTests`. This matrix says what MCP
reaches; that one says who may reach it at all.

## Known gaps

Every child of milestone #135 has merged, so nothing from it carries a `pending-` code. What is left of it is the
shape of the surface, not unfinished work.

- **A connected app never reads a canon finding.** `canon-conflicts` is `person-only`: the older Canon integrity
  queue is a person's to work through. World Logic's own findings (#153) *are* readable, by
  `list_world_logic_findings` and `get_world_logic_finding`, so the two integrity surfaces answer differently. Worth
  revisiting together rather than one at a time.
- **The MCP findings reader cannot ask for the newest first.** `GET world-logic/findings` gained an optional `sort`
  of `attention` (the default) or `newest` in #209, after #154's tools were written, so `list_world_logic_findings`
  always reads the `attention` order. A client that wants the newest has to page and sort what it gets. Recorded
  rather than fixed: adding the argument is a change to #154's tool, not to this audit.
- **A submitted claim cannot be read back over MCP.** `submit_semantic_finding` writes
  `world-logic/semantic-findings`, but its read cell is `person-only`: there is no tool for a client to see what
  became of its own claim, the way `get_change_proposal` does for a proposal. Deliberate for now, since nothing in
  the web UI shows a submitted claim either (issue #209).
- **A System and a rule definition are proposed, never removed.** `propose_changes` stages a `system_rule` or a
  `system` (create and update) for a person to approve, and a System's ordered rule list travels with it (ADR 0072
  addendum). Neither can be removed through review: a System delete is permanent and a rule definition has no Trash,
  so an author deletes them in LorEvolve. A condition may name only records that already exist, not ones the same
  proposal creates.
- **A machine's states and transitions are proposed one at a time, never removed, and best approved together.**
  `get_system_machine` reads a System's machine and `propose_changes` stages a `system_state` or a
  `system_transition` (create and update, #361). Each is bound to the System's version at staging, and every machine
  save bumps it, so approving some machine changes of one System now and the rest later fails the rest as
  `changed_since`: approve them together, or ask for the rest again. "Try an entry" on `systems/machine` has no tool;
  a client evaluates a transition's guard with `evaluate_world_logic_rule`.
- **The matrix is domain-level, and a nested family inherits its parent's answer.** A row covers a family of routes
  sharing a prefix, and one row may hold several: World Logic's rules are read through the single row that covers
  `systems`, `system-rules` and `world-logic/rules` together. A route whose first segment is new fails the route test
  until it is classified, but a route nested under an existing prefix is claimed by that prefix and answered the same
  way, with nothing failing.

  The prefixes this limitation showed up on are `systems`, `system-rules` and `world-logic/rules`: the three that make
  up the World Logic Systems and rule definitions row today. Until #153 and #154 landed, that row was an excepted one
  keyed on `systems`, `system-rules` and a bare `world-logic`, and when the two new route groups arrived,
  `world-logic/findings` and `world-logic/semantic-findings` were both claimed by that bare `world-logic` prefix and
  inherited its exception without complaint. What caught them was the tool test, because their eight new tools were
  unmapped. Narrowing the bare prefix to `world-logic/rules` is what gave those two rows of their own, and it is why
  the three are listed separately now, but the general hole stands: a change that adds a nested route family and no
  tool is the case to read this document carefully for. Making the route test exact would mean a row per endpoint,
  about 250 of them, which is the trade this shape was chosen against.
