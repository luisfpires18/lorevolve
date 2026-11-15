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
an app reads directly and writes only by staging a proposal that a person approves in LorEvolve. A cell holds either
the MCP tools that reach the domain, or one of these codes.

| Code | What it means |
| --- | --- |
| `read-only-by-design` | A read exists; writing is never direct. The write path is `propose_changes`, or the web app. |
| `person-only` | Deliberately outside the MCP surface: the decision is a person's, never an app's. Collaborators, invitations, publishing, approving a staged change, accepting a suggestion, review comments, backups, canon findings. |
| `media-bytes` | Picture bytes, not data. A lore picture is fetched by `get_lore_image`; everything else is served at its own address to a signed-in person. |
| `live-only` | An app reads what is live. History, revisions and the Trash are not on the MCP surface. |
| `pending-issue-154` | No MCP tool yet. World Logic Systems and rule definitions are persisted (#150) and evaluated (#151); their MCP tools land in issue #154. |

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
| World Logic Systems and rule definitions | `systems`, `system-rules`, `world-logic` | `pending-issue-154` | `pending-issue-154` |
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

`propose_changes` is the one tool that is not read-only. It stages; nothing over MCP approves or applies
(ADR 0047). Two resources it may name have no route of their own in the tables above: `Idea`, which belongs to the
universe owner's own account rather than the universe, and `Media`, which asks a person to upload a picture on the
review page because no file comes through an MCP connection.

`get_change_options` reads what the connected person's role allows and the universe's real ids; `get_change_proposal`
reads back what happened to a proposal the same connection staged.

## What is exercised, and where

| Concern | Tests |
| --- | --- |
| The tool list is exactly these tools | `McpCapabilityMatrixTests`, `McpToolTests.The_SDK_client_finds_exactly_the_read_only_tools`, `McpProposalTests` |
| Reads, through the real transport and the official SDK client | `McpToolTests`, `McpClientInteropTests`, `McpProjectToolTests`, `McpProjectEntityToolTests`, `McpImageToolTests`, `MapGeographyTests` |
| Proposals, and that they only stage | `McpProposalTests`, `McpProjectEntityToolTests` |
| The approval boundary: nothing over MCP approves, and a staged change dies with its permission | `McpProposalTests.An_app_stages_a_proposal_that_waits_for_a_person_and_never_applies_itself`, `McpProposalTests.Turning_proposals_off_or_disconnecting_stops_the_tools_and_blocks_what_was_staged` |
| Permissions: scopes, roles, revocation, one universe per token | `McpScopeTests`, `McpOAuthTests`, `McpAliasTests`, `McpConnectedAppTests` |
| Pagination | `McpToolTests.The_timeline_is_browsed_a_page_at_a_time`, `McpProjectEntityToolTests.A_project_s_entries_are_listed_a_page_at_a_time_and_read_one_by_one`, `McpToolTests.A_long_manuscript_is_read_in_bounded_chunks_that_join_back_exactly` |
| Error handling: unknown tools, bad arguments, ids that are not ids, ids of another universe or the Trash | `McpToolTests.Unknown_tools_and_bad_arguments_are_refused`, `McpToolTests.Ids_from_another_universe_the_Trash_or_nowhere_read_as_not_found` |
| MCP off entirely | `McpDisabledTests` |
| World Logic conditions, five unrelated domains plus the edge cases | `WorldLogicEvaluatorTests.Every_case_of_a_fixture_evaluates_as_the_specification_says`, `WorldLogicFixtureTests` |

The permission side of every route above, for every role, is `UniverseAccessMatrixTests`. This matrix says what MCP
reaches; that one says who may reach it at all.

## Known gaps

- **World Logic over MCP is not there yet.** `systems`, `system-rules` and `world-logic` (the one read that returns
  both kinds of rule together) carry `pending-issue-154`. Issue #153 (persisted findings) and #154 (the MCP integrity
  and rule-proposal tools) were still open when this matrix was written, so a findings domain will join the tables when
  #153 lands, and the three `pending-issue-154` prefixes become tools when #154 does. Issue #152, the World Logic page,
  merged while this was in review and added no API route of its own.
- **A connected app never reads a canon finding.** Today findings are a person's review queue (`person-only`). If #154
  gives an app a finding-submission workflow, the `canon-conflicts` row is the one to revisit.
