# Phase 4 - Family Trees: manual test

The owner's pass over Family Trees (ADR 0035). One universe, about twenty minutes. Everything below is
authored by hand: nothing in LorEvolve decides which entries are people, and nothing reads a relation kind's name.

Use any universe with a few entries, or make one. Names in this document are examples; use your own.

## 1. A kind means nothing until you say so

1. Open **Types** and add a relation kind called `parent of`, reading `child of` the other way. Leave
   **Family meaning** as *Not a family connection*. Save.
2. On an entry - say **Mara** - add a relation: `parent of` **Lia**.
3. Open **Family Tree** in the sidebar and choose **Lia**.

Expect: Lia alone. The kind's name said nothing, and LorEvolve read nothing from it.

## 2. Give the kind a meaning

1. Back on **Types**, edit `parent of` and set **Family meaning** to *Source is the biological parent*.
2. Expect the direction line to read that the source is the biological parent and the target the child, and the
   kind's row to say `Family: biological parent → child`.
3. Return to Lia's family tree.

Expect: Mara above Lia, marked **Parent · Biological parent**. Nothing about the relation itself changed - open
Mara's entry and the relation still reads `parent of Lia`.

## 3. Adoptive, and a second parent

1. Add a second kind, `raised`, reading `raised by`, with **Family meaning** *Source is the adoptive parent*.
2. On **Oren**, add `raised` **Lia**.
3. Open Lia's family tree.

Expect: two parents. Mara's connection is a solid line and reads *Biological parent*; Oren's is a dashed line and
reads *Adoptive parent*.

## 4. Siblings and grandparents, which nobody recorded

1. Record: Mara `parent of` **Tam**, Oren `raised` **Tam**, and **Nana** `parent of` Mara.
2. Open Lia's family tree.

Expect:

- **Tam** beside Lia as a **Sibling**, with a line for each shared parent - *Shares Mara — biological for both*
  and *Shares Oren — adoptive for both*.
- **Nana** above, as a **Grandparent**, reading *Mara's biological parent*.
- No sibling or grandparent connection anywhere on Tam's or Nana's entry: look at their **Relations**. Only the
  parent links you wrote are there. Everything else is worked out while the page is drawn.

Also expect no claim about how much family Lia and Tam share: a sibling is a sibling. If you record only one of
someone's parents, LorEvolve says nothing about the other - unknown is not the same as none.

## 5. Children and grandchildren

1. Record: Lia `parent of` **Cai**, and Cai `raised` **Pip**.
2. Reload Lia's family tree.

Expect: Cai below Lia as a **Child**, and Pip below Cai as a **Grandchild**, reading *Cai's adoptive child*. The
tree reaches two generations each way and stops - a great-grandchild is not shown until you focus on someone
closer to them.

## 6. Moving through the family

1. Press **Show this family** on Tam.

Expect: the address changes to Tam, and Lia is now Tam's sibling.

2. Press the browser's **Back**.

Expect: Lia's family again.

3. Reload the page.

Expect: the same family - the entry in focus is in the address.

4. Press **Open entry** on Mara, then **Family tree** on her entry page.

Expect: Mara's family, with Lia as a biological child.

## 7. Adding a connection from the tree

1. On any family tree, press **Add family connection**.
2. Choose a kind, choose whether the entry in focus is the parent or the child, pick the other entry, set a
   status, and save.

Expect: the tree redraws with the new relative, and the connection appears on both entries' **Relations** as an
ordinary relation of that kind. There is no second, hidden kind of family link.

## 8. A connection that is not settled yet

1. Add a family connection with status **Draft**.

Expect: its line is faint and its card says **Draft connection**. Nothing that is not Canon is drawn as settled
family history.

## 9. A circle

1. Record, deliberately: **Arlen** `parent of` **Brin**, and **Brin** `parent of` **Arlen**.
2. Open Arlen's family tree.

Expect: a notice naming the circle and both connections, in words. The page still opens, Brin appears as both a
parent and a child, and **nothing is changed or deleted**.

3. Open **Canon**.

Expect: a Medium finding, `CANON-FAMILY-001`, naming the same circle. Correct or remove one of the links and it
resolves on the next write.

## 10. A name still means nothing

1. Add a kind called `mother of` and leave its family meaning as *Not a family connection*.
2. Record `mother of` between two entries and open the tree.

Expect: nothing. Only the meaning you configured counts, in any language.

## 11. The Trash

1. Move a parent - say Mara - to the Trash.
2. Open Lia's family tree.

Expect: Mara is gone, and so is anything reached only through her - Nana as a grandparent, and Tam's shared
connection through Mara. Tam stays if another shared parent remains.

3. Restore Mara from the Trash.

Expect: everything comes back exactly as it was. The connections were never touched.

4. Open the family tree of an entry that is in the Trash, by address if you kept it.

Expect: "That entry is not here."

## 12. Another account

1. Sign in as a second account and open, by address, a family tree from the first account's universe.

Expect: "That entry is not here." Nothing about the other world is shown, named or hinted at.

## 13. Backup and restore

1. Export the universe from **Settings**.
2. Restore the backup as a new universe (**Restore backup** beside New universe).
3. Open **Types** in the restored universe.

Expect: each kind carries the family meaning you gave it.

4. Open the family tree of the restored **Lia**.

Expect: the same family as the original, drawn from entries with new ids of their own.

5. If you kept an older backup, from before this release: restore it too.

Expect: every kind restores with **no** family meaning, whatever it is called, and its family trees are empty
until you say what one of its kinds means.

## 14. On a phone, and in the dark

1. Narrow the window to about 390px, or use a phone, and open a family tree with several siblings and parents.

Expect: the tree can be scrolled sideways inside its own box, the entry in focus starts in view, and the page
itself never scrolls sideways.

2. Switch the system theme to dark, and back.

Expect: the cards, lines and labels stay legible in both.

3. Try an entry with a long name, and one written right to left.

Expect: names wrap inside their cards and read in their own direction.

## 15. The keyboard

1. From the top of a family tree, press Tab repeatedly.

Expect: the picker, then each card's **Show this family** and **Open entry**, in the order they are drawn. The
focus is always visible, and every position - parent, adoptive parent, sibling through whom - is written in
words beside the name rather than only drawn as a line.
