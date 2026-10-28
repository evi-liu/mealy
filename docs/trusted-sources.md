# Trusted recipe links

The first version starts with household go-tos and trusted-source **bookmarks**, not a generic recipe API subscription. The user selected **The Woks of Life** and **Tiffy Cooks** as starting sources. This is a source preference, not permission to copy their content. No specific go-to recipes or recipe URLs were supplied.

## What the app does

The Recipes tab links to both sites and accepts a pasted HTTPS recipe URL plus a label written by the user. It saves only that bookmark in the private household document. It does not fetch the URL, generate a preview from its content, copy a photograph, parse Recipe JSON-LD, or claim a successful import.

A bookmark clearly says that yields/ingredients have not been entered and cannot enter the swipe queue, plan or grocery calculations. **Enter my own recipe details** opens a manual form with source attribution preserved. Serving yield, batch capacity, time and ingredient amounts start blank; the user must review/enter them, provide their own method or content they have permission to save, and acknowledge those rights before saving a complete household recipe. This is not permission to paste a publisher's copyrighted instructions or photos.

## Permission checks

Official sources were checked on **2026-10-28**:

| Source           | Official page retrieved                                    | What was verified                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Woks of Life | [Disclaimer](https://thewoksoflife.com/disclaimer/)        | Liability, affiliate and site-use information; no explicit grant for automated recipe extraction and durable storage was found on this page. Its contact address for questions is listed there. |
| Tiffy Cooks      | [Privacy policy](https://tiffycooks.com/privacy-policy-2/) | Personal-data/privacy practices; this is not a license for copying recipe details or photographs into another app.                                                                              |

Guessed terms-page URLs returned 404, and some homepage fetches failed. **A comprehensive content-use policy has not been verified for either site.** Do not translate "permission not verified" into a claim that all personal use is prohibited, or infer extraction permission from structured recipe metadata. Automatic import stays unavailable.

No recipe instructions/photos were copied, no extraction service was enabled, and no vendor was contacted. Generic provider licensing work is deferred under the user's updated scope. For context, Spoonacular's [terms](https://spoonacular.com/food-api/terms) and Edamam's [recipe API policy](https://developer.edamam.com/edamam-recipe-api) impose storage restrictions; TheMealDB was not chosen.

## If automatic import is requested later

Obtain a clear source license or written permission covering the intended private two-person use before implementing an adapter. Confirm:

- Which recipe text, ingredient quantities/units, original serving yields, timing, attribution and images may be fetched and persistently stored, including private backups/offline use.
- Permitted scaling, consolidated saved grocery quantities and derived household meal plans.
- Required source links, copyright notices, takedown procedures, refresh/retention requirements and any cost.
- Whether processing source data with an external LLM for tagging/ranking is allowed. No AI use, embedding retention or training rights should be inferred.

Then use an authenticated server-side adapter with an explicit host allowlist, SSRF/redirect protections, size/time limits and no access-control bypass. The user must review extracted yields, ingredients, quantities, units, timing and attribution before enabling planning. Missing or ambiguous fields remain unresolved; the model must not invent them. Preserve bookmark-only behavior for unsupported or unpermitted sources.
