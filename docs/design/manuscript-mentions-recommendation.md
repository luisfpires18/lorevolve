# Interactive @Lore mentions (issue 31) - persistence recommendation

Status: decided 2026-10-25 - the owner chose E1, implemented under ADR 0058. Kept as the record of the options weighed
before any manuscript code was written.

## What the manuscript is today (as built)

- **Storage.** `SceneManuscripts.Content` is plain text stored exactly as typed, with `Version` and `UpdatedAt` (ADR 0027,
  0043). Every changing save writes a whole-text `SceneManuscriptRevision` (ADR 0029). A restore of a version is a save.
- **Editor.** `ManuscriptEditor.tsx` is one native `<textarea>`: native undo/redo, caret, selection and paste; Ctrl+S; a
  leave guard; `EditConflict` on 409 `scene_manuscript_changed`; a device recovery copy of unsaved text in IndexedDB
  (`useLocalDraft`, keyed by account, universe and scene). Nothing reads the text for meaning.
- **Readers of prose**, each of which a representation must survive: the manuscript route and its history; the backup
  (`BackupScene.Manuscript` and its revisions, byte-exact) and the restore, which gives every id a new value and rewrites
  nothing inside authored text; the universe search FTS5 triggers on `SceneManuscripts` (raw text indexed); the public
  story page (`PublicManuscriptPart` carries the raw text); `UniverseReader.GetSceneAsync` behind the assistant and MCP
  (`read_scene_manuscript`, `search_scene_manuscript`, passages); AI change proposals that append to or replace a
  manuscript; the Lore Context drawer, which previews an entry by id.
- **Precedent.** The article's links may be `http`, `https`, `mailto` or relative; no id inside authored text is remapped
  on restore today. Articles that link into the workspace by address dangle after a restore - an accepted limitation.

## Representation

**Recommended: one inline token in the plain text, resolved by id.**

```
@[Akron Wright](lore:3f9c1a2b-7d4e-4c1a-9b2f-0e8d6a5c4b3a)
```

- `@` is the gesture the author made; `[...]` carries the name as it read when inserted (readable fallback, never the
  identity); `(lore:<guid>)` is the entry's stable id. Anything that does not match the exact pattern is prose.
- Zero schema change. The column, the revisions, the recovery copy, the conflict check, the backup members and the
  1,000,000-character bound stay exactly what they are. Two exports of unchanged prose still serialise byte for byte.
- Parsed in one place on the server (`ManuscriptMentions`: find, render, remap) and one on the client; resolved only
  against the entries of the manuscript's own universe, never by name.

Rejected:

- **Sidecar offsets** (`SceneId, EntityId, Start, Length`): every keystroke before a mention moves it; offsets drift
  silently through paste, undo, conflicts and history restores, and a drifted offset is a mention pointing at the wrong
  words. The one representation that *can* silently corrupt what a mention means.
- **Hidden characters** (private-use delimiters around the name): invisible to the author, visible to screen readers,
  split by caret movement, mangled by copy into other apps, stripped by some IMEs.
- **A document format** (Tiptap JSON like the article): ADR 0027 refused it deliberately; every reader above changes,
  every manuscript migrates, formatting arrives by the back door. Largest blast radius for the smallest feature.

## The product choice the owner must make: what the editing surface shows

The storage above is right either way. What differs is whether the author sees the token while writing.

**E1 - keep the `<textarea>`; the token is visible while editing (recommended for V1).**
Everywhere prose is *read* the token renders as the entry's name: the public page (plain text, as decided), the Lore
Context drawer, the conflict review, history, the assistant and MCP, search excerpts, the human-readable export (#11).
Autocomplete is a popover at the caret (caret position measured with a mirror element); choosing an entry inserts the
token through `insertText`, so it is one native undo step. A "Mentioned in the text" list in the Lore Context drawer
carries each mention's name, type and state, the existing preview, and the owner's per-mention "Add to this scene's
Lore" action. Costs: the author reads `@[Akron Wright](lore:...)` in their own draft, and text copied out of the editor
carries it. Every approved constraint - plain text, undo, paste, drafts, conflicts, revisions, recovery, export - holds by
construction, because nothing but a string ever moves.

**E2 - replace the `<textarea>` with a ProseMirror editor (Tiptap is already a dependency) limited to paragraphs, text and
a mention node, serialised to the same plain text with the same tokens.** The author sees "Akron Wright" as a chip; storage
is unchanged. Costs: ProseMirror owns undo/redo, paste must be forced to plain text, whitespace fidelity (trailing spaces,
blank lines, indentation) must be proven lossless both ways, mobile IME behaviour differs from a textarea, and every
Playwright spec that types into the manuscript changes. Nicer, and reversible later: E2 can be layered over E1's storage
without touching a stored manuscript, so choosing E1 now forecloses nothing.

Optional with either: a rendered read mode for members whose role is read-only (today they get a read-only textarea),
which is the natural home for clickable mentions.

## How edits and events affect a mention (under the recommended representation)

| Event | Effect | Manuscript text |
| --- | --- | --- |
| Typing elsewhere, paste, undo, redo | None: a token is ordinary characters. | Unchanged by LorEvolve. |
| Editing inside a token (a bracket deleted) | It stops matching and is prose again; the mentions list no longer shows it. No hidden state can disagree with the text. | What the author typed. |
| Deleting the token | The mention is gone. The scene's lore links are untouched (they are a separate decision, per the owner). | What the author typed. |
| Entry renamed | The id still resolves; readers render the current name. The token keeps the name typed at insertion; the mentions list can say "written as X". | Unchanged. |
| Entry in the Trash | Readers render the carried name as plain text; the list marks it "In the Trash". A restore from the Trash makes it resolve again (ids are stable). | Unchanged. |
| Entry erased for good | Never resolves: the carried name, plain, forever. Prose is never rewritten because lore changed. | Unchanged. |
| A member loses access | Access is per universe (ADR 0041), so losing it hides the whole manuscript, as today. There is no per-entry revocation to model. | Unchanged. |
| Public page | Every mention renders as its name in plain text - published or not, and never a link - exactly as decided. Nothing of the entry but the name the author wrote into their own prose can appear. | Unchanged. |
| Backup / restore | Byte-exact in `BackupScene.Manuscript` and every revision, format unchanged. The restore rewrites `lore:<old id>` to the new id in the manuscript and each revision - the one text rewrite a restore would ever make, on well-formed tokens only; an id the file does not hold is left as it is and renders as its name. | Rewritten on restore only, ids only. |
| Human-readable export (#11) | Names. | - |
| Copy / paste | Plain text; the token travels. Pasted into another scene of the same universe it still resolves; into another universe it renders as the name. Other apps see the token (E1's one visible cost). | - |
| Save conflict, history, recovery copy | Strings compared and stored as today; nothing changes. | - |
| Search | The name inside the token is indexed as words (found); the hex id is noise nobody types. Excerpts render names on the client. | - |
| Assistant / MCP | `read_scene_manuscript` and `search_scene_manuscript` return the name in place of the token. | - |
| AI change proposals | Text is text: a proposed append or replace may carry tokens; an id that is not a live entry of this universe simply renders as its name. No proposal can invent an entry or a link. | - |
| `@` in ordinary prose | Suggestions open only for `@` at a word start followed by a character; Escape, or a space with nothing chosen, leaves `@word` as typed. | - |

## V1 limits

Entity mentions only (no scenes, stories or moments; variant selection waits for #30's follow-up); no inline click in a
textarea (E1); no automatic Canon, lore or scene-link change on insertion - "Add to this scene's Lore" is a click, idempotent
when already linked, and uses the scene's own `PUT` with its version as the Lore Context drawer does today.
