# ADR 0054 - Duplicate is a new entry's form filled from another, and copies only what it says

Status: accepted (2026-10-24). GitHub issue 27. Owner decisions 2026-10-24.

## Context

Creators make structurally similar entries and re-enter the same type, tags and field values by hand. A copy must not
silently take what makes the source itself - its identity, history, links to other entries, picture or story
associations - and must not stay tied to it afterwards.

## Decision

**A prefilled form, not a copy endpoint.** Duplicate, in an entry's ⋯ menu for whoever can edit content, opens
`lore/new?from=<id>`. The page reads the source and its article once and opens the ordinary new-entry form filled from
them. Nothing exists until Create entry, which is the ordinary `POST /entities`: the copy gets its own id, its own
Created revision, its own search entry and the promotion gate, and nothing on the server knows it was a copy. A source
that cannot be read leaves a blank form and says so.

**What starts in the form:** the source's type, summary, tags and the values of its active fields, the name as
"<name> (copy)", Canon status Idea (never the source's), private (a new entry always is).

**Offered, off:** the source's aliases (they name the source, in search and pickers); its link fields' values, the
values pointing at other entries (only while the form keeps the source's type, and never one pointing into the Trash);
and its article. The boxes read the form, so removing a copied alias by hand clears its box. When the article is
chosen, the panel lists every link it carries - text and address, "inside LorEvolve" for a workspace link - because the
article is copied as written, links and all.

**Never copied, named in the panel:** the picture, relationships, story and scene links, eras, forms, appearances,
comments, history and publication. They are not offered in V1.

**Another type** takes only the basics. Changing the type empties the type's fields as it always has (no field is ever
matched by name), its defaults apply, and its required fields are asked for by the ordinary create validation.

**The article is a second write.** It is saved after the create as the copy's first article version, from the text the
panel showed. If it is refused, the entry stands and the page says the article could not be copied, as with a new
entry's picture.

**One page instance, a fresh form.** An entry and a new entry are one route element, so moving between them keeps the
page; that is what lets a create land on its entry with its messages. Opening a new form (from an entry, or from one copy
to another) remounts the page, so nothing of the entry it was opened from leaks into the form.

## Consequences

- No API, schema, backup, MCP or Assistant change. Reviewers and Viewers never see Duplicate; `lore/new` is already
  role-gated.
- Not atomic: an entry can be created without its chosen article, said on screen. A server-side copy route would make
  it atomic, at the cost of a second create path.
- Not done: Duplicate from lists, copying a picture, relationships or story links, and bulk copy.
