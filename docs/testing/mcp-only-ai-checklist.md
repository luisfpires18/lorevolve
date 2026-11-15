# MCP-only AI: the check after M4

What to look at on DEV once milestone M4 (#136) is deployed, to see that the one remaining way for AI to reach a
universe still works and that nothing of the retired web assistant is left on screen. The automated suites cover every
line of this in CI; this is the human pass, in a browser and a real AI client, which no test can make.

Decisions: ADR 0046 (the connection), ADR 0047 (proposals), ADR 0062 (schema proposals), ADR 0045 (retired, 2026-11-15).
Inventory and evidence: `docs/architecture/audits/2026-11-15-m4-assistant-retirement-audit.md`.

## 1. Nothing of the assistant is left

1. Open a universe. There is no Assistant button beside the search, on a wide screen or on a phone.
2. Profile > Usage holds Storage and nothing else: no AI Assistant block, no questions, no change requests.
3. Admin workspace > AI usage and cost says nothing is counted here.
4. Ask for the retired routes by hand and get 404 from each:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://dev-lorevolve.azurewebsites.net/api/profile/assistant-usage
   ```

5. On the App Service, no `Assistant__*` app setting is needed to boot. Any still there is read by nothing; deleting
   them and revoking the Groq and OpenAI keys is the owner's step, and the audit's section 7 lists it.

## 2. The AI help switch still governs what is left

1. In a universe's settings, turn AI help off. Connect to AI goes from the universe's front page and AI Changes goes
   from the sidebar. Nothing else changes.
2. Turn it back on. Both return.
3. The hint under the switch names Connect to AI and AI Changes, and no assistant.

## 3. A real client connects and reads

1. Universe front page > Connect to AI. Copy the address, and in Claude or ChatGPT add it as a connector.
2. The consent screen is LorEvolve's own: it names the app, says what it may read, and offers "propose changes"
   unticked. Approve with proposing left off.
3. In the client, ask something only this universe knows: an entry, a relationship, a scene's prose, a map location, a
   project's entries. Every answer cites what it read, and nothing is invented.
4. Profile > Connected apps lists the app as Reader, and says it reads only.

## 4. Proposing, reviewing and applying

1. Connect the app again, this time ticking "propose changes". Connected apps now says Creator.
2. Ask it for a change that touches several resources at once: a new entry with an article, a world rule and a plot arc
   in one proposal.
3. Nothing has changed in the universe yet. Pending AI Changes lists the proposal, naming the app as its source.
4. Approve part of it: only what was chosen is applied, and anything that needed what was rejected is rejected with it.
5. Ask it for a picture of an entry. The review page asks you to upload the file; the picture is attached only when you
   approve the change.
6. Ask it for a new lore type with fields. It arrives as a proposal of its own, and approving it puts the type in Types
   where an entry can use it.
7. Connected apps > stop this app's proposals. The app can still read, and can propose nothing more.

## 5. Where a proposal the old assistant staged still shows

If any universe still has a proposal from before M4, Pending AI Changes labels it "LorEvolve Assistant", and it reviews,
approves and rejects exactly as an app's does. That label is why `AiChangeSource.Assistant` was kept.

## What to record

The client and its version, the universe, each question asked and the answer's gist, what was staged and what was
applied, and anything that read wrongly or is missing. A failure here is an Issue, not a line in this file.
