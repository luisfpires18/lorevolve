# MCP pictures - real-client smoke checklist (issue #56)

SDK tests prove the bytes; only a real client proves a person sees them. Run this against DEV after the
`fix/mcp-image-client-fallback` commits are deployed. Record results in issue #56 - never paste image base64,
tokens, cookies or the connection URL's universe id into the issue.

## Setup

1. DEV has `Mcp__Origin` set (runbook `docs/deployment/azure-dev.md`).
2. Test universe: LOTR. Entry **Bilbo Baggins** has a profile picture. One entry has an appearance whose
   picture is ticked for a form (or create one: Progression -> Forms, then an appearance ticked for that form,
   then upload a picture to the appearance).
3. In ChatGPT (developer mode connector) remove and re-add the LorEvolve connection so the tool list is fresh: it must
   list `list_lore_images` and `get_lore_image` with the `format` argument.

## Steps

| # | Ask ChatGPT | Expect | Record |
|---|---|---|---|
| 1 | "Show me Bilbo Baggins' portrait" | `list_lore_images`, then `get_lore_image` (preview, webp) | Image visible? Blank tile? Wording |
| 2 | "Fetch that portrait again with format png" | `get_lore_image` with `format: "png"` | Visible? Compare with step 1 |
| 3 | "Fetch the thumbnail variant" | WebP square 320 px | Visible? |
| 4 | "Show me the <form> look of <entry>" | Only the picture of the appearance ticked for that form | Right picture? Never the portrait |
| 5 | "Show me <entry with no pictures>'s portrait" | "This entry has no pictures." | No invented image |
| 6 | "Fetch the original of <large mural>" (> 4 MB) | `image_too_large`, preview offered | Refusal shown honestly |
| 7 | If any image is blank: "Give me the LorEvolve link" | The Lore / progression page link from the result | Link opens LorEvolve; signed out -> sign-in first |
| 8 | Profile -> Connected apps: revoke the connection, ask again | Connection refused, nothing shown | ChatGPT reports the failure |

## Read the result

- Step 1 blank, step 2 visible: WebP is the client's limit. Make `png` the default for preview (one constant) and
  record it in ADR 0046.
- Steps 1 and 2 both blank: the client does not draw MCP image blocks. The page link (step 7) is the supported path;
  record the limitation in ADR 0046 and the issue. Check ChatGPT did not say "Here's the image" over a blank tile;
  if it did, quote the tool description it was given.
- Both visible: record the client and date; the fix is the fallback wording only.
