# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The owner first: one person who builds LorEvolve and builds their own fictional worlds in it. Then other
people who want the same thing, invited during the alpha: writers, game designers and worldbuilders. One
author works alone in a universe most of the time, in long sessions on a laptop, with a phone for looking
something up or noting an idea. A universe can have collaborators with roles, but that is the smaller case.

## Product Purpose

LorEvolve is where an author keeps a fictional world and makes things with it. A universe holds lore
entries of the author's own types, their relationships, a chronology and timeline, maps, ideas, world
rules and systems, and the projects made from the world: writing, games, cinema and comics. Success is an
author who finds what they recorded, sees what to do next, and trusts that nothing changes unless they
change it.

## Positioning

The world and the works made from it live in one place and reference each other: a scene points at the
entries in it, a project draws on the universe's lore, Canon checks catch contradictions. AI is connected
through MCP and only proposes changes; the author approves each one.

## Operating Context

- The workspace is everything under `/app`: the list of universes, one universe's sections, the account.
- The public portal (Explore, published universes, reading pages) is a separate surface for readers.
- Invite-only alpha, version `1.0.0-alpha`. PROD at lorevolve.com, DEV deploys from `dev`.
- English and European Portuguese. Installable as a PWA.

## Capabilities and Constraints

- Sections, routes and features of the workspace stay as they are in the 2026-11 redesign; layouts,
  components and styles are rebuilt (owner, 2026-11-22).
- React and TypeScript on Vite, native CSS with tokens, one icon family (`lucide-react`). No UI
  framework and no Tailwind (ADR 0020).
- Authored text can be any script and any length: names in `<bdi>`, prose in `.prose`.
- Files split at 300 lines; 500 is the hard maximum.

## Brand Commitments

- Name: LorEvolve. The drawn `L` mark and the wordmark.
- Copy follows `docs/design/PRODUCT_VOICE.md`: plain labels, the product's real terms, no slogans, no em
  or en dashes, placeholders that say what to insert.
- Workspace themes (owner, 2026-11-22): dark is crimson and black, light is white and purple. Both stay.
- The workspace follows the conventions of a modern admin, played straight (owner's choice, 2026-11-22):
  sidebar, top bar with search, tables and lists, one main action per screen. It sits alongside Linear,
  Notion and the Stripe Dashboard; their finish is the bar.

## Evidence on Hand

- The running app and its seeded test worlds. No customer quotes, metrics or press exist; none may be
  invented.
- Earlier design contract, now replaced for the workspace: `docs/design/LOREVOLVE_VISUAL_REFACTOR.md`.

## Product Principles

1. Show what the author can act on. Information nobody acts on leaves the screen.
2. One main action per screen, in the same place on every screen.
3. The author's world supplies the character: their names, pictures and types. The app's own chrome stays
   quiet around it.
4. Nothing changes without the author: AI proposes, the author approves.
5. A new feature is put together from parts that already exist.

## Accessibility & Inclusion

Keyboard use, visible focus and screen reader names are kept on every screen. Body text reaches 4.5:1
contrast; large text and control borders reach 3:1. Phone widths from 390px work.
