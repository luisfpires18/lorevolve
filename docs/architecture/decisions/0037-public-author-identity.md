# ADR 0037 - An author is public only through a chosen name, a minted address and a photo they chose to show

Status: accepted (2026-09-28)

## Context

Task 011 gives the public portal authors: "by Mara Vell" on a card and a world should lead somewhere, and a reader should
be able to see what else that person has published. Until now the only public trace of an account was its public name
(ADR 0036), read live onto each public world. An author page needs an address, and a creator's page wants a picture -
but the account already has a photo that ADR 0021 promised is private to its owner's session, and an account id,
username and email that must never appear publicly.

## Decision

**The account's public page is a separate thing from its account page.** `/app/profile` stays the workspace's account
screen - email, account id, the photo, the public name - and is never shown to anyone else. `/authors/{slug}` is a portal
page that reads only an allow-list: `PublicAuthor` (`slug`, `displayName`, `avatarUrl`) and the author's public worlds
through the universe listing's `author` filter.

**The address is minted once, from the public name.** `AspNetUsers.PublicAuthorSlug`, unique, null until the account first
publishes a universe; publishing mints it inside the publish transaction with the shared generator (`PublicSlugs`,
fallback `author`, `-2` on collision). Never derived from the username or email, and never changed after - renaming the
public name renames the author everywhere and keeps the address. Accounts that were already public before this decision
get theirs at startup (`PublicAuthorBackfill`, a hosted service that runs before the first request, from the public name).
The universe predicate now also requires the owner's address, as it requires the public name: a public universe always
has an author page to link to.

**An author exists publicly only while they have a public universe.** `GET /api/public/authors/{slug}` answers only while
`PublicationRules.Public` finds a universe of theirs; otherwise it is the same 404 as an address nobody holds. Registering
never makes an account findable, and making every world private takes the author page down with them.

**The photo is public only by an explicit, per-picture choice.** `ProfileImages.IsPublic`, false for every existing photo
and every new one. The owner turns it on from the Profile ("Show my photo on my author page"); replacing the photo turns it
off again, because the consent was for that picture. Reframing keeps it - same picture. Only the square (the upload gate's
320-pixel WebP, re-encoded, metadata stripped) is ever served publicly - never the original - at
`/api/public/authors/{slug}/avatar/{thumbnailId}`, only while the choice is on and the author has a public universe, only
for the current square: ETag = the square's id, checked after visibility, `no-cache`. Without a public photo the page draws
the name's first letter in a ring; no face is ever invented.

A separate public-avatar upload was the alternative and was refused: a second pipeline, a second picture to keep in step,
and a second place for a private picture to be mistaken for a public one - to save one checkbox.

## Consequences

- ADR 0021 is amended: the photo is private unless its owner chooses otherwise, per picture.
- Nothing of this is in a universe backup: the address and the photo's choice belong to the account, and a backup holds one
  world's authored data (ADR 0014, 0032).
- An author address is not reserved after an account is deleted. A second author of the same name gets `-2`, which reveals
  that the name was taken by a public author - accepted, the first one was public.
- The workspace link from a public page (Task 011) is answered by an owner-scoped route (`/api/universes/by-address/{slug}`),
  never by a field in any public response: no public DTO names an owner or an id.
