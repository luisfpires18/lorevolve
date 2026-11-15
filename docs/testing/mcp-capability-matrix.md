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
| An entry's private note | `entities/private-note` | `person-only` | `person-only` |
| An entry's map pins | `entities/map-pins` | `get_map_location` | `read-only-by-design` |
| Tags | `tags` | `get_lore_entry` | `read-only-by-design` |
| Lore types and their fields | `entity-types` | `get_change_options` | `LoreType`, `LoreField` |
| Semantic groups and the family tree | `entity-type-groups`, `family-tree` | `get_change_options` | `LoreGroup` |
| Relationships | `relationships`, `entities/relationships` | `get_lore_relationships` | `Relationship` |
| Relationship kinds | `relationship-types` | `get_change_options` | `RelationshipType` |
| The timeline | `timeline` | `browse_timeline`, `get_timeline_moment` | `TimelineEvent` |
| The reckoning and its calendar | `chronology` | `get_change_options` | `Chronology` |
| World Rules | `world-rules` | `get_change_options` | `WorldRule` |
| World Logic Systems and rule definitions | `systems`, `system-rules`, `world-logic/rules` | `list_systems`, `list_world_logic_rules`, `get_world_logic_rule`, `evaluate_world_logic_rule`, `get_rule_impact` | `read-only-by-design` |
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
| Review comments | `entities/comments`, `stories/comments`, `stories/scenes/comments`, `comment-threads` | `person-only` | `person-only` |
| Suggested changes | `entities/suggestions`, `stories/suggestions`, `stories/scenes/suggestions`, `suggestions` | `person-only` | `person-only` |
| The Trash | `trash` | `live-only` | `live-only` |
| Publishing | `publication`, `publish`, `unpublish`, `entities/publication`, `entities/publish`, `entities/unpublish`, `stories/publication`, `stories/publish`, `stories/unpublish`, `stories/scenes/publish`, `stories/scenes/unpublish`, `stories/scenes/manuscript/publish`, `stories/scenes/manuscript/unpublish`, `stories/plot-arcs/publish`, `stories/plot-arcs/unpublish` | `person-only` | `person-only` |
| The universe's artwork | `artwork` | `media-bytes` | `media-bytes` |
| Backups and the readable export | `export` | `person-only` | `person-only` |
| What an entry knows | `knowledge` | `get_lore_entry` | `read-only-by-design` |
| Maps and their pins | `maps` | `list_maps`, `search_map_locations`, `get_map_location`, `measure_map_distance` | `read-only-by-design` |
| A map's picture | `maps/image` | `media-bytes` | `media-bytes` |
| Collaborators | `collaborators` | `person-only` | `person-only` |
| Invitations | `invitations` | `person-only` | `person-only` |
| Lore references | `lore-references` | `get_lore_entry` | `read-only-by-design` |

## Inside a project

A project is account-owned with an optional universe link (M1). The MCP surface reaches the projects of the connected
universe only.

| Operations | Route prefix | Read over MCP | Write over MCP |
| --- | --- | --- | --- |
| A project itself | `/`, `template` | `list_projects`, `get_project`, `get_project_script` | `person-only` |
| A project's entries | `entities` | `list_project_entries`, `get_project_entry` | `ProjectEntry` |
| A project entry's history | `entities/revisions` | `live-only` | `live-only` |
| A project's own types | `entity-types` | `get_project_schema` | `read-only-by-design` |
| A project's structure | `seasons` | `get_project_structure` | `read-only-by-design` |

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

## What is exercised, and where

| Concern | Tests |
| --- | --- |
| The tool list is exactly these tools | `McpCapabilityMatrixTests`, `McpToolTests.The_SDK_client_finds_exactly_the_read_only_tools`, `McpProposalTests`, `McpWorldLogicToolTests.Every_read_tool_is_discoverable_and_the_one_that_writes_is_not` |
| Reads, through the real transport and the official SDK client | `McpToolTests`, `McpClientInteropTests`, `McpProjectToolTests`, `McpProjectEntityToolTests`, `McpImageToolTests`, `MapGeographyTests` |
| Proposals, and that they only stage | `McpProposalTests`, `McpProjectEntityToolTests`, `McpWorldLogicToolTests.Get_change_options_and_propose_changes_still_work_and_a_rule_is_still_proposed_through_them` |
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

Every child of milestone #135 has merged, so nothing in the tables carries a `pending-` code. What is left is the
shape of the surface, not unfinished work.

- **A connected app never reads a canon finding.** `canon-conflicts` is `person-only`: the older Canon integrity
  queue is a person's to work through. World Logic's own findings (#153) *are* readable, by
  `list_world_logic_findings` and `get_world_logic_finding`, so the two integrity surfaces answer differently. Worth
  revisiting together rather than one at a time.
- **A submitted claim cannot be read back over MCP.** `submit_semantic_finding` writes
  `world-logic/semantic-findings`, but its read cell is `person-only`: there is no tool for a client to see what
  became of its own claim, the way `get_change_proposal` does for a proposal. Deliberate for now, since nothing in
  the web UI shows a submitted claim either (issue #209).
- **A System and a rule definition are read-only over MCP and have no proposal resource.** An author writes them in
  the API; `AiChangeResource` has no member for either, so an app cannot stage one. Whether it should is on the
  milestone summary for #135.
- **The matrix is domain-level, and a nested family inherits its parent's answer.** A row covers a family of routes
  sharing a prefix. A route whose first segment is new fails the route test until it is classified, but a route nested
  under an existing prefix is claimed by that prefix and answered the same way, with nothing failing. This is not
  theoretical: when #153 and #154 landed, `world-logic/findings` and `world-logic/semantic-findings` were both claimed
  by the `world-logic` row and inherited its `pending-issue-154` without complaint. What caught it was the tool test,
  because their eight new tools were unmapped. So the two tests cover each other here, and a change that adds a nested
  route family but no tool is the case to read this document carefully for. Making the route test exact would mean a
  row per endpoint, about 250 of them, which is the trade this shape was chosen against.
