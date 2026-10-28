# Issue #45 - MCP V2 completion: Azure DEV manual test

For the owner, once `feat/mcp-v2-content-coverage` is merged into `dev` and deployed to Azure DEV. Use a **disposable
universe** made for this pass; never a real one. Record expected and observed results in the table at the end.

## Setup

1. Sign in on DEV as the owner. Create universe `QA Issue 45` with one story `QA Story`, two Character entries `QA Arin` and
   `QA Varn` (any Kingdom if the type requires one), one relation kind `QA rules` (inverse `QA ruled by`), one event kind
   `QA Coronation` and one method `QA Oath` (Chronology / World Rules vocabulary).
2. Invite a second account as **Editor**.
3. Connect an MCP client to the universe, ticking "Also let ... propose changes". Note which client (Claude, ChatGPT, other).

## Trash lifecycle (by hand)

| # | Step | Expected |
| --- | --- | --- |
| T1 | Relate `QA Arin` *QA rules* `QA Varn`; remove it from Arin's Relations | Confirmation says Trash; Relations empty; Trash lists "QA Arin QA rules QA Varn", kind Relationship |
| T2 | Restore it | Back on both entries and in the Family Tree if the kind has a family meaning |
| T3 | Remove it again, trash `QA Varn`, then restore the relationship | Refused: an entry it connects is in the Trash; row says so |
| T4 | Restore `QA Varn`, create the same relationship again, then restore the trashed one | Refused as a duplicate, naming the live one |
| T5 | Create a moment `QA Crowning` (Canon, year 5, Arin); delete it | Gone from Timeline; Trash lists it as Timeline moment; restore brings it back with participants |
| T6 | Download a backup while one link and one moment are in the Trash; restore it as a new universe | Restored universe's Trash holds both; both restorable |

## AI proposals (MCP client and LorEvolve Assistant)

Ask each in plain words; never approve inside the AI tool. After each proposal, open its review link in LorEvolve.

| # | Ask the AI to | Expected in Pending AI Changes, then after Approve |
| --- | --- | --- |
| A1 | Call `get_change_options` | Lists plot arcs per story, world rules, event kinds and methods; ideas listed only for the owner's connection; allowed includes `reorder chapter`, `remove relationship`, `update article` |
| A2 | Write an article for `QA Arin` (append two paragraphs and a heading) | "Prose" change with the text; after approval the entry's article shows it, formatted as heading and paragraphs, no links or markup |
| A3 | Replace Arin's article without reading it first | Refused: needs `expectedVersion` (the AI should read `get_lore_entry`'s `articleVersion` and retry) |
| A4 | Create plot arc `QA Rise` in QA Story with two beats, one linked to a scene and Arin | Beats need the arc (selecting a beat selects the arc); after approval, Plot shows the arc and beats in order |
| A5 | Reorder those beats | "Order" change listing old and new order; after approval the order is reversed |
| A6 | Create world rule `QA One crowning` with a check (QA Coronation, QA Oath, at most 1) | Check line reads "At most 1 Canon QA Coronation by QA Oath for each participant"; rule exists with its check after approval |
| A7 | Give the QA Crowning moment the story QA Story and details (QA Coronation, QA Oath, Arin) | After approval the moment shows the story and details |
| A8 | Remove the relationship and the moment | Both "To the Trash"; after approval both in the Trash, restorable |
| A9 | (Owner) Create an idea `QA What if Arin lies?` referring to Arin | Proposal visible to the owner; **the Editor does not see it** in Pending AI Changes or by its link |
| A10 | (Editor's MCP connection) Ask for an idea | Refused: only the owner proposes ideas; `get_change_options` lists no ideas |
| A11 | Ask to delete a relation kind, a field or an event kind | The AI reports it can't; nothing staged |
| A12 | Revoke proposals for the connection, then try to approve a pending proposal from it | Blocked: can only be rejected |

## Results

| # | Client | Observed | Pass / fail |
| --- | --- | --- | --- |
| | | | |

Note any tool-selection problems (the client not finding `propose_changes`, schema errors, cut catalogs) as limitations.
