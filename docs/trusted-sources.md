# Trusted recipe links

The first version starts with household go-tos and trusted-source **bookmarks**, not a generic recipe API subscription. The user selected **The Woks of Life** and **Tiffy Cooks** as starting sources, then approved twenty curated links and a facts-only import for the ten Tiffy links. This is not permission to reproduce authored directions, narrative text or photographs.

## What the app does

The Recipes tab links to both sites and accepts a pasted HTTPS recipe URL plus a label written by the user. Pasting a link saves only that bookmark in the private household document; it does not fetch arbitrary URLs or claim a successful import.

A bookmark clearly says that yields/ingredients have not been entered and cannot enter the swipe queue, plan or grocery calculations. **Enter my own recipe details** opens a manual form with source attribution preserved. Serving yield, batch capacity, time and ingredient amounts start blank; the user must review/enter them, provide their own method or content they have permission to save, and acknowledge those rights before saving a complete household recipe. This is not permission to paste a publisher's copyrighted instructions or photos.

## Selected Tiffy Cooks facts

**Add recipe facts** adds the checked snapshots in `src/tiffy-facts.json` only for matching saved bookmarks, without overwriting existing recipes or edits. The original bookmarks remain saved but duplicate link-only cards are hidden. Each reference recipe retains its source URL, retrieval time and original ingredient lines. No instructions, descriptions, nutrition text or images are included.

All imports start **Review before planning**. Explicit quantities and supported units are prefilled. Missing amounts, ranges, unknown units and compound stock/water entries stay unresolved. The review form leaves those amounts blank; the household must choose quantities, split compound entries or explicitly remove ingredients it will not use. Packages, blocks and cloves remain counts, not invented weights. Duplicate source lines are retained. Ingredients omitted by the source (such as rice alongside braised pork) are not invented; add any desired sides during review.

The published yield is initially also the maximum batch size. Review practical equipment capacity, main protein/variety and leftover/potluck suitability before saving. Acknowledgement and valid quantities are required to mark the recipe reviewed. Original source lines stay available for comparison after edits. Cooking directions open on Tiffy Cooks, not in a copied Method section. Any uploaded photo must be the household's own or permitted.

Unreviewed imports are excluded from shortlists, votes, plans, swaps and grocery arithmetic. Reviewed recipes use the same deterministic scaling as household recipes. Update older app clients before adding reference recipes; older clients intentionally reject the unfamiliar source type rather than stripping it during a save.

`node scripts/collect-tiffy-facts.mjs` reproduces only these ten factual snapshots from Recipe JSON-LD. It has a fixed source list, exact HTTPS host checks on redirects, a timeout and a response-size limit. Collection fails visibly on missing yields/times or unexpected source structure and writes only after every source succeeds. Review the generated diff and rerun recipe-facts tests before publishing changes. This is not a live scraper, scheduled refresh or unrestricted import endpoint.

## Permission checks

Official sources were checked on **2026-10-28**:

| Source           | Official page retrieved                                    | What was verified                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Woks of Life | [Disclaimer](https://thewoksoflife.com/disclaimer/)        | Liability, affiliate and site-use information; no explicit grant for automated recipe extraction and durable storage was found on this page. Its contact address for questions is listed there. |
| Tiffy Cooks      | [Privacy policy](https://tiffycooks.com/privacy-policy-2/) | Personal-data/privacy practices; this is not a license for copying recipe details or photographs into another app.                                                                              |

Guessed terms-page URLs returned 404, and some homepage fetches failed. **A comprehensive content-use policy has not been verified for either site.** Do not translate "permission not verified" into a claim that all personal use is prohibited, or infer a reproduction license from structured recipe metadata. The user-approved factual snapshots above are bounded separately; arbitrary-URL and full-content imports remain unavailable.

No recipe instructions/photos were copied, no external extraction service was enabled, and no vendor was contacted. Generic provider licensing work is deferred under the user's updated scope. For context, Spoonacular's [terms](https://spoonacular.com/food-api/terms) and Edamam's [recipe API policy](https://developer.edamam.com/edamam-recipe-api) impose storage restrictions; TheMealDB was not chosen.

## If broader automatic import is requested later

Obtain a clear source license or written permission covering the intended private two-person use before implementing an adapter. Confirm:

- Which recipe text, ingredient quantities/units, original serving yields, timing, attribution and images may be fetched and persistently stored, including private backups/offline use.
- Permitted scaling, consolidated saved grocery quantities and derived household meal plans.
- Required source links, copyright notices, takedown procedures, refresh/retention requirements and any cost.
- Whether processing source data with an external LLM for tagging/ranking is allowed. No AI use, embedding retention or training rights should be inferred.

Then use an authenticated server-side adapter with an explicit host allowlist, SSRF/redirect protections, size/time limits and no access-control bypass. The user must review extracted yields, ingredients, quantities, units, timing and attribution before enabling planning. Missing or ambiguous fields remain unresolved; the model must not invent them. Preserve bookmark-only behavior for unsupported or unpermitted sources.
