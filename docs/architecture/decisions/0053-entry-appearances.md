# ADR 0053 - An entry's appearances are one record each, with a gallery stored like the entry's own picture

Status: accepted (2026-10-24). GitHub issue 43, under parent issue 30. Amends ADR 0014 (backup version 30), ADR 0042 (what
counts against storage) and ADR 0050 (the progression carries appearances).

## Context

Characters change outfits, armour and looks; places and ships change too. Issue 43 asks for visual history on the same entry,
reusing the image storage Lorex has, with no new image dependency. The owner settled (2026-10-24): one Appearance record covers
outfits and looks - a label, notes, an ordered gallery of zero or more pictures, and links to eras, forms and scenes; a form's
look is the appearances linked to it; the entry's main picture is unchanged; removing a picture deletes it, and pictures are
not versioned.

## Decision

**An appearance is part of the progression.** `EntityAppearances` (label unique within the entry, notes, the author's order)
with `EntityAppearanceEras`, `EntityAppearanceForms` and `EntityAppearanceScenes`, saved by the same
`PUT .../entities/{id}/progression` (`appearances`; left out keeps what is stored), under its version, history and restore. At
most 50 an entry. Nothing is inferred: an appearance belongs to the eras, forms and scenes ticked, no more.

**Its pictures are not.** `EntityAppearanceImages` hold an ordered gallery, at most 20 a look, on routes of their own under
`.../entities/{id}/appearances/{appearanceId}/images`: `PUT` adds one (multipart, like the entry picture), `PUT /order` sets the
order (exactly the gallery's pictures, else 409), `DELETE /{imageId}` deletes one, `GET /{imageId}/original|thumbnail` streams
one to a member. The entry picture's pipeline throughout: the server decodes and cuts a centred square WebP thumbnail, keys are
ids only (`universes/{u}/entities/{e}/appearances/{a}/{imageId}/...`), both objects are written before the row, growth is held
against the universe owner's storage first, objects are swept only after the row stops naming them. Never public.

**Removing a look never loses a picture silently.** A save or a history restore that would remove an appearance still holding
pictures is refused (409 `entity_appearance_has_pictures`); the client deletes the pictures first, after saying so.

## Consequences

- A form's look reads from the appearances that name it; an era shows the appearances ticked for it.
- Removing an era or a form strips it from appearances only when the save sends them so; otherwise refused, as for forms.
- Storage counts appearance pictures as Lore pictures, against the universe owner.
- Erasing an entry for good and deleting a universe sweep appearance pictures with the entry's own.
- Backup version 30 carries appearances and each picture's original in the archive; a restore re-cuts thumbnails, holds the
  owner's storage for them, and gives everything new ids. A version 29 or older file restores every entry with none.
- Not public, not searched, not read by the assistant, MCP or AI changes.
