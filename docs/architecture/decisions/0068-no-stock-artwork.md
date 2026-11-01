# ADR 0068 - LorEvolve shows no stock artwork; only authors' pictures and the brand mark

Status: accepted (2026-10-30).

## Context

LorEvolve's own surfaces carried three generated paintings as decoration: the citadel behind the home page's hero,
behind My workspace and Admin, and behind every universe screen whose world had no card of its own; the ridge behind
the sign-in plate; and a panorama behind Explore's title. Around them sat the furniture such pictures ask for: veils,
text shadows, a small-caps eyebrow, a headline with a dimmed third line, four live counts on the hero's foot, three
icon medallions in equal columns, a centred last call.

Read together, the owner found the result looked generated rather than made, and asked that the pictures go. The
portal's own rule already points the same way: nothing on it is invented (ADR 0036), and a painting that belongs to
no world was the one invented thing the portal still showed.

## Decision

**No stock pictures anywhere LorEvolve speaks for itself.** The home page, Explore, My workspace, Admin, the sign-in
plate and a universe's shell draw no image that is not an author's own. The brand mark (`public/brand-mark.png`) and
the launch logo are identity, not decoration, and stay.

**An author's artwork is content and stays everywhere it was.** The world cards on Explore and the public world pages
keep their pictures; the universe plates on My workspace keep the owner's card; the universe shell draws its atmosphere
from the world's own card and, since this decision, draws nothing at all for a world without one: the element is not
rendered, so `workspace-atmosphere` is absent rather than filled with a fallback.

**Words carry the home page.** A two-sentence head on the page's own ground, one hairline beneath it, then the sections
as before, each laid out its own way; trust is three plain paragraphs; the live counts are gone; the way in has one
name on the whole page and in the bar: *Create account*, or *Go to my workspace* once signed in. Explore's head is the
title, one line of support and the filters, on the same ground. Outlined pills keep the bar's border; a form control on
a plain ground is bounded by `--border-control` (3:1, WCAG 1.4.11).

**The tokens stay.** Paper, graphite, ink, the book-face display and the portal's dark-by-default theme are the
product's identity (ADR 0067) and are not what this decision is about.

## Consequences

- Four files leave the repository: `src/assets/atmosphere-citadel.webp` and `atmosphere-ridge.webp` (and the folder
  that held them), `src/portal/explore-worlds-background.png` and its `.webp`. The alpha site under `site/alpha` keeps
  its own copy of its hero and is unaffected.
- `GET /api/public/stats` (ADR 0036 amendment, 031) stays as it is, with its tests, but no web page reads it; the
  security assessment's L-6 still lists it. Removing it takes a decision of its own.
- `.auth__plate`, `.home` and the two heads lose the stacking contexts they kept for the pictures; the `.atmosphere`
  block keeps its veil and opacity tokens for a world's own card.
- The role marks read "Shared as Editor" on a card and in the shell's sidebar, and Explore's sort reads "A to Z": no
  middle dots or dashes in interface text, the owner's rule.
- The sign-in plate is plain graphite: the mark, the wordmark, its rule and the pitch.
