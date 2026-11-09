# Product voice

How LorEvolve's own words are written: the demo page, the app's labels, empty states, errors and emails.
What an author writes inside a universe is theirs and is never touched by these rules.

The visual contract is `LOREVOLVE_VISUAL_REFACTOR.md`. This file covers copy, which that document left out.

## Who is speaking

One person built LorEvolve and is still building it. On the demo page that person says "I". There is no "we",
because there is no team.

Inside the app nobody narrates. Labels name things, and a sentence addressed to the author uses "you".

## Rules

1. Say what the thing does. A reader should be able to picture the screen from the sentence.
2. Show an example before making a claim about a feature. One character followed through four screens explains
   more than a list of capabilities.
3. Use the everyday word for an everyday action: create, delete, rename, share.
4. Keep the product's real terms and use each for one thing only: universe, entry, Canon, Lore, Chronology, idea,
   story, scene.
5. No slogans. A heading states a fact about the product or names what is below it.
6. Group things in threes only when there are three things.
7. Do not set up something nobody said in order to correct it. A contrast stays when the reader really does expect
   the other thing, such as an AI that guesses.
8. Controls are plain. No jokes, no exclamation marks, no fantasy flavour on a button or an error.
9. Say the limits as they are: it is an alpha, the built-in assistant has a small shared allowance, AI is off until
   the author turns it on, and it never changes anything by itself.
10. Every claim describes something that works today.
11. Placeholders say what to insert ("Insert a name") and never show an example value.
12. No em dashes or en dashes, and no spaced hyphen standing in for one.
13. A line that already sounds like a person stays, even if it is a little unusual. Change copy because it breaks a
    rule here, never for novelty.

## Examples

Change these.

| Where | Now | Write |
| --- | --- | --- |
| Demo page heading | Build the world. Evolve the story. Connect everything. | Build a fictional world and write the stories that happen in it. |
| Demo page, lore entries | Everything is generic and customizable. | You decide what each kind of entry records. |
| Demo page, AI | It also provides a MCP, an open standard that lets an AI app use another app's data. | You can connect Claude or ChatGPT to one universe through MCP, an open standard that lets an AI app use another app's data. |
| Demo page, last section | We're not finished yet | I'm not finished yet |
| Explore, no results | Try another word, category or genre - or see every world. | Try another word, category or genre, or see every world. |

Leave these alone.

| Where | Line | Why it stays |
| --- | --- | --- |
| Register | Claim a name, and the workroom is yours. | It has a voice and says what happens next. |
| Feedback form | What you did, what you expected, and what happened instead. | Three items because a bug report has three parts. |
| Assistant | It can prepare changes you ask for. They wait for your review, and nothing changes until you approve them. | A candid limit, stated plainly. |

## Before a string ships

- Read it aloud. If it could sit on any other product's page unchanged, it needs the specific noun.
- Search `tests/LorEvolve.E2E/specs/` for the old text and change the assertion in the same commit.
