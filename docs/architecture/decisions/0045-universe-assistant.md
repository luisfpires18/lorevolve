# ADR 0045 - The universe assistant reads through permission-safe tools over a shared read layer, behind a narrow provider boundary

Status: accepted (2026-10-14). Roadmap task 047 (GitHub issue 5).

## Context

Writers want to ask their universe questions - who is whose father, which scenes involve someone, what happens before the
siege - and get answers they can trust and check. A language model can phrase those answers, but it knows nothing about a
universe, will happily invent canon, and anything a model can be told to do, content can try to tell it too. The answer
has to come from LoreX's own data, say what is recorded and what is not, and be unable to change anything.

LoreX already searches a universe (ADR 0031) and already reads every entry, story, scene, moment and relationship for its
screens. Global Quick Find (task 046) was skipped: another shortcut over the same search did not earn its place.

## Decision

**A read layer beneath the screens, shared.** `Features/Reading/UniverseReader` reads the live universe for something
other than a screen: `SearchAsync`, `GetLoreAsync`, `GetStoryAsync`, `GetSceneAsync`, `GetTimelineItemAsync`,
`BrowseTimelineAsync`, `GetRelationshipsAsync`, `GetOverviewAsync`. It decides nothing afresh. Search is the bar's own
query, extracted beneath its route as `UniverseSearchEndpoints.RunAsync` (ideas searched only when an account is named;
the bar names the signed-in one, the reader none); the timeline is the timeline feed's own query, extracted beneath its
route as `TimelineFeed.ReadAsync`; entries, stories, scenes, moments and relationships are their features' own loaders.
The reader only bounds and flattens: plain records (`UniverseReadings.cs`), long text cut, dates written the way the
universe writes them (`ReadingText`, the server's copy of the client's chronology formatter), no image, route, account or
Trash. It knows nothing of AI, so a later reader - a writing workspace, MCP - can use it as it is. The caller proves the
universe may be read; every query names the universe again, so an id from anywhere else is not found.

**The model can only read, by construction.** `AssistantTools` defines eight tools - `search_universe`, `get_lore`,
`get_relationships`, `get_story`, `get_scene`, `get_timeline_item`, `browse_timeline`, `get_universe_overview` - each a
call into the reader. No tool writes, none takes SQL, a URL, a path or a universe; a name the model invents answers
`unknown_tool`. One instance serves one question in one universe the caller may read. Every id the model sends is parsed
and read through that universe; a bad one is `not_found`, a broken argument `bad_arguments`, a failed read `read_failed`,
and the question goes on.

**What may be read.** Live lore (name, type, Canon status, summary, aliases, tags, fields, the start of the article, the
passage of the article around words asked for, the scenes and moments it is in, a relationship count), stories (premise, status, chapters, scenes in reading order, arcs and
beats), scenes (place, summary, notes, point of view, date, lore; the start of the manuscript, or its passage around words
asked for, only when asked), timeline
moments and the unified timeline, direct relationships, and a bounded overview. Never ideas, world rules, comments,
suggestions, history, Trash, accounts, emails, invitations, storage, backups or images.

**Long prose is reached where the words are, through the search's own index.** An article or manuscript is read from
its start, cut at 1,500 or 4,000 characters. Past that, `get_lore` and `get_scene` take `find`: the reader asks the same
FTS5 index the search uses for `snippet()` at its widest (64 tokens), over that one live row's column, with the search's
own reading of words (`EntitySearchIndex.PassageAsync`, `ArticlePassageAsync`, `UniverseSearchIndex.ManuscriptPassageAsync`).
No new index, no second matcher, never the whole text. The search result itself already carries a 16-word excerpt and
says the words were found in the article or the prose; the instructions tell the model to read the passage before
saying anything is not recorded.

**Content is data.** Authored text reaches the model only as tool results. The instructions name tool results as content
written by the universe's authors, never instructions, and they never contain authored text themselves.

**Answers are checked, not trusted.** The final answer is JSON in a schema - segments of `recorded`, `inference`,
`suggestion` or `note`, each citing ids. A cited id counts only when a tool returned it during this question; its kind,
title and story come from what LoreX read, never from the model. A `recorded` segment with no real source is shown as an
inference. An answer that is not the schema fails (502). Nothing is a URL: the client builds each link from the kind and
ids, through the same addresses the search uses.

**Bounded.** At most 6 steps may use tools and 10 tools run per question; then one last step without tools. A tool result
is cut at 10,000 characters and all of them at 40,000; the question at 1,000; the history at its last 6 messages of 1,500
characters each; output at 3,000 tokens a step; the whole question at 90 seconds, and a closed request stops it.
`UniverseReader` caps every list and text it returns (its constants). One account asks at most 20 questions in 10
minutes (`AssistantAllowance`, a fixed window per account; 429 `assistant_rate_limited`; see the usage amendment).

**A narrow provider boundary.** `IAssistantProvider` and `IAssistantConversation` carry LoreX's own types: messages, tool
definitions, tool calls and results, one turn. A provider never reads the database, runs a tool or sees a universe id.
`Assistant:Provider` chooses, as `Media:Provider` does: `OpenAI` (`OpenAIAssistantProvider`, the only file that knows
OpenAI exists - the official library's Responses API, one retry, a 45-second network timeout); `Fake` (`FakeAssistantProvider`, the local server and the
Playwright suite: no network, real tools, canned wording by plain rules); unset, `UnavailableAssistantProvider`.
`Assistant:OpenAI:ApiKey` and `Assistant:OpenAI:Model` are both required and neither has a default; the key is a secret
(user secrets locally, App Service settings in Azure). A host never fails to start over this: an incomplete setting is
unset. Not set up is 503 `assistant_unavailable`, and nothing else in LoreX notices.

**Stateless, reasoning included (amended 2026-10-15).** Every request sets `store: false`, so nothing is kept at OpenAI
and no response id is reused; the conversation is sent again each step. That is OpenAI's stateless mode, and a reasoning
model needs its reasoning carried through a tool loop: every request asks for `include: reasoning.encrypted_content`, and
every item a step returns - encrypted reasoning, function calls, messages - goes back unchanged, in order, with the next
step. The reasoning stays inside the provider: never in a turn, a log or an answer. A model that does not reason returns
no reasoning items and is served by the same requests, so any Responses model that supports function calling and strict
structured output is in bounds; nothing is restricted by name. The first cut dropped reasoning items between steps; that
is gone.

**Who may ask.** Asking is reading: `UniverseAccess` `Read` - owner, Editor, Reviewer, Viewer - before the question is
looked at, the universe read or a model called. Anyone else gets the universe's usual 404. No public route.

**Nothing kept.** No conversation, question or answer is stored; no table, no migration. The browser holds the
conversation while the universe is open and sends its last messages with the next question; a reload starts afresh.

**Failures in LoreX's words.** Provider failure or an unreadable answer 502 `assistant_failed`; provider rate limiting 503
`assistant_busy`; too slow 504 `assistant_timeout`. OpenAI also answers 429 when the account has no credit
(`insufficient_quota`); waiting never fixes that, so it is `assistant_failed`, not busy. The provider's own words, the key and the prompts are never in an
answer; logs carry the failure kind, steps, tool count and token counts, not content.

**Where it lives on screen.** An Assistant button beside the universe's search on every screen of a universe (its icon
alone on a phone), opening a drawer in the moment drawer's frame. Opening it reads only `GET .../assistant` (is it set
up?); nothing reaches a model until a question is sent. Each part of an answer is labelled Recorded, Inference or
Suggestion (a note carries none), with its sources as links.

## Amendment - Groq as a second Responses provider (2026-10-16)

DEV's OpenAI account has no credit, and Groq's free tier serves an OpenAI-compatible Responses API. `Assistant:Provider`
`Groq` chooses `GroqAssistantProvider`, with `Assistant:Groq:ApiKey` and `Assistant:Groq:Model` (DEV:
`openai/gpt-oss-120b`), both required, neither defaulted; missing either is unset, as for OpenAI, and nothing ever falls
back to Fake.

- **One exchange, two servers.** The conversation, strict tools and answer schema, tool loop and failure classes moved,
  unchanged, from `OpenAIAssistantProvider` into `ResponsesConversation`. Each provider owns only its endpoint and what
  its requests carry about storage and reasoning.
- **OpenAI is unchanged:** its own endpoint, `store: false`, `include: reasoning.encrypted_content`.
- **Groq omits what it does not accept:** no `store` and no `include` - left out of the request, not sent empty. Groq's
  endpoint is `https://api.groq.com/openai/v1`. Its reasoning models return reasoning as plain output items, which go
  back with the next step as every item does, as Groq's own multi-turn examples send them.
- **What Groq means for privacy:** with Groq chosen, the content a question needs goes to Groq under Groq's data policy;
  there is no `store` to opt out with. The operator's choice, as the OpenAI one is.
- Groq's free tier rate-limits by tokens per minute; a 429 is `assistant_busy`, as OpenAI's is.
- **Groq never pairs tools with the answer schema** (live 400: "json mode cannot be combined with tool/function
  calling"). A step that allows tools sends the tools and no `text.format`. The answering step sends the strict schema
  and no tools. A tool step that answers in free text is followed by the answering step at once.
- **One tool call per Groq step:** `parallel_tool_calls: false`, because Groq's models table lists the gpt-oss models
  without parallel tool use. The limits are unchanged, so a Groq question reads at most six times, one per tool round.
- **An unparseable tool call is asked for once more** (live 400 `tool_use_failed`, "Failed to parse tool call
  arguments as JSON"). Groq returns it when the model's generated call is not valid JSON, and its tool-use guide
  recommends sending the request again. Groq only, and only on a step that allows tools: one more identical request for
  that code and nothing else. OpenAI's failures are handled as before.
- **What the model generated is never logged.** A Groq `tool_use_failed` refusal, and any other refusal that carries
  `failed_generation`, may hold the universe's own text, in the generation or quoted in Groq's message. It is logged
  without the SDK exception that holds the body, as provider, status, code, a fixed category, attempts and whether tools
  were sent, for example `Groq answered 400 (tool_use_failed: invalid_arguments) after 2 of 2 attempt(s), tools sent.`
  The category comes from an allowlist matched against phrases Groq is known to use: `tool_requested_with_none_allowed`,
  `invalid_arguments`, `unknown_tool`, `other`. Groq's own words are never logged. The person sees the same generic error.
- **A tool the model calls on the answering step means it wanted to read more** (live diagnosis, 2026-10-18, fictional
  data, `openai/gpt-oss-120b`). The answering step sends no tools, and Groq refuses with "Tool choice is none, but model
  called a tool". It refused every time when the model still wanted information (11/11 after one lookup) and never when it
  had what it needed (10/10 after three). This was the same over Chat Completions, with the tools listed and
  `tool_choice: none`, and with an explicit "do not call any tool" instruction (0/5), so none of those is the fix. The
  refusal is reported as a turn that is `StillLooking`, never as an invented call or answer. When the tool budget is
  spent, the assistant gives its existing "ran out of room" note, incomplete, as it does for OpenAI. If the model reached
  the answering step early, after free text with lookups left, the question fails instead: the budget did not run out.
- **Groq's tool steps are not told to reply with JSON** (Azure DEV: `tool_use_failed: unknown_tool after 2 of 2`;
  live diagnosis 2026-10-18, fictional data). The tool steps carry no answer schema, but the instructions still ended
  "Reply with JSON that follows the schema". When gpt-oss was ready to answer, it addressed that JSON to a tool called
  `json`, which does not exist, and Groq refused the request. On the same history this happened 5/5 times with the
  sentence and 0/5 without it: all five answered in prose, which the answering step then turns into the schema's JSON.
  LoreX had sent all eight tools, with correct names and schemas, on every step. The instructions are now
  `GroundRules` plus `AnswerFormat`, and the format goes only with the schema. For OpenAI that is every step, with
  byte-identical text. For Groq it is the answering step only.

## Amendment - the allowance Settings shows (2026-10-19)

The Profile's Usage section shows each account its own assistant allowance: "N of 20 questions used", the percentage, a
meter, what is left, and when it is used up, when the next question can be asked. Groq's or OpenAI's own quotas are the
host's, not a person's, and are never shown.

- **One count for enforcing and showing.** ASP.NET Core's `FixedWindowRateLimiter` cannot say when an account's window
  ends (its `Retry-After` was always the whole window), and its per-partition limiters live inside the middleware. So
  the framework limiter is gone and `AssistantAllowance` (a singleton, one lock) both refuses and reports. No second
  counter exists to disagree with it.
- **Same allowance.** 20 questions per account per 10 minutes, a fixed window opened by the account's first question
  after its last window ended; at the end all 20 come back at once. Same 429 body. `Retry-After` is now the seconds
  until the window ends, rounded up.
- **What counts.** Every question that reaches `POST .../assistant` as a signed-in account: answered, a body that is not
  JSON (400), refused for its content (400), not found (404), not set up (503), failed (502/504) or cancelled. A question
  refused for the allowance (429) is not counted, a signed-out request (401) counts against no one, and reading the
  status or the usage counts nothing.
- **Where it counts.** `UseAssistantAllowance`, a middleware right after `UseAuthorization`, where the framework limiter
  stood: it acts only on endpoints carrying `AssistantQuestionMetadata` (the ask route alone) and runs before the body is
  read. An endpoint filter would run after binding and let a malformed body through uncounted.
- **Reading it.** `GET /api/profile/assistant-usage`: `used`, `limit`, `remaining`, `windowSeconds`, `resetsAt` (null with
  no open window). From the session only; no account id is accepted. Nothing about questions or answers is kept.
- **Limits.** In-process memory, as before: a restart resets every count, and two instances would each allow 20. DEV is
  one App Service instance. `resetsAt` is formatted in the browser's clock, so a skewed clock shifts the time shown.

## Deliberately unsupported

- Any write, comment, suggestion, Trash, restore or other action; background or autonomous work.
- Ideas, world rules, comments, suggestions, history and anything private to an account.
- Persistent conversations, memory, a history browser; streaming (the answer is shown whole).
- Web search, embeddings, a vector store, an AI-only index, or any second search algorithm.
- Public Explore; account-wide questions; choosing a provider or a model on screen.
- Sentence-level citations: sources are per part of an answer.
- Automated continuity checking: the assistant may say that what it read disagrees, nothing more (Canon stays ADR 0010).

## Consequences

- The universe content a question needs is sent to the configured provider. With OpenAI, `store: false` keeps responses
  out of OpenAI's stored responses; what the provider otherwise retains is its own policy, and the operator's choice.
- Every step resends the conversation so far, so a question that reads near its limits costs up to seven calls of roughly
  this much input each. The limits above are what bounds it; the rate limit bounds an account.
- Carrying encrypted reasoning makes each step's input larger for a reasoning model; it is opaque and bounded by the
  model's own output cap.
- A cut tool result keeps the start of its JSON; readings are bounded so this is rare.
- A passage is one 64-token fragment, FTS5's best for the words: a fact spread across several far-apart places needs
  more than one `find`.
- A search tool result is the bar's search: whole words and prefixes, every word required. The model is told to search
  for a name or two.
- The provider is held to the official library's real serialization by tests over a stub transport
  (`OpenAIAssistantProviderTests`), and to the live API by an opt-in smoke (`AssistantOpenAISmokeTests`, skipped unless
  `LOREX_ASSISTANT_SMOKE_MODEL` and `OPENAI_API_KEY` are set in the environment).
- The OpenAI library marks its Responses client experimental (`OPENAI001`); the suppression sits in the one file that
  uses it.
