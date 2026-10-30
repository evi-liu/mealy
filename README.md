# Mealy

A mobile-first, installable React + TypeScript kitchen planner for one two-person household. Vite/static frontend, Base UI controls, Supabase Google authentication/Postgres/private Storage, and a server-side Copilot SDK integration for shortlist ranking and recipe drafting. Intended Pages URL: `https://evi-liu.github.io/mealy/`.

## What works

- Sunday setup defaults to **two dinners, four dinner servings, ten leftover lunch servings**. Kairos adds a separate eight-serving dish. Travel and Kairos start off. The explicitly labeled weekday assumption removes two lunches per Monday-Friday away; weekends do not alter lunch needs.
- One shared shortlist of up to twelve recipes; like, temporary skip, undo, and explicit "don't recommend." Build unlocks on **viable serving coverage**, not simply a count of likes. You can continue swiping.
- Recipe cards can be dragged and thrown. A small dependency-free spring engine (`src/motion/`) carries a fling toward the **Like** or **Not this week** edge targets that appear while the card is held; pausing before letting go (or releasing away from a target) springs the card back without voting. Buttons stay available and play the same animation; reduced-motion settings skip animation.
- Recipes is a compact thumbnail library. The top-right **+** opens a bottom sheet with **Add with AI** and **Link a website**. New recipes start with an AI draft or a server-side link import, not a blank manual form. Review and edit the generated quantities and directions before saving; the text box below the review form can refine the draft. Drafts remain unsaved until confirmed, are labeled **AI-drafted**, and never substitute canned recipes on failure.
- **Add with AI** opens a tall, keyboard-aware prompt sheet; describe the dish, then review the generated draft before saving. Cancel closes an idle sheet; a pending request cannot be dismissed into a late editor. AI-assisted recipes use a labeled sparkle badge, retaining their source names when available.
- The search button beside **+** opens an instant, local search of saved recipes by title, ingredient or source. Clear resets the query; Cancel or Escape returns to the library. Searching never calls AI or an external recipe service.
- Opening a recipe fills the mobile viewport, with a persistent top-left Back button instead of a floating card or dimmed backdrop. Returning preserves the originating library/search or plan. Remixes do not inherit an original dish's photo.
- Recipes use a flat, borderless list with the heart at the far right. Swipe a saved recipe row left for **Edit** and **Delete**; keyboard users can focus its title and press Left Arrow or Shift+F10 (right-click also works). Escape closes the actions and restores title focus. Deletion requires confirmation, removes shortlist references, and invalidates any affected plan/grocery list while keeping pantry inventory. It doesn't create a dislike or clear an existing recommendation block. Unused private photos are removed only after the household save succeeds. Catalog suggestions can be reviewed without deleting shared catalog data.
- Any recipe can be remixed from its full recipe card: type into **I want to remix this recipe...** and the remix animates in with added, removed and changed ingredients, steps and details highlighted (computed by the app, with the AI's comments attached). Keep refining, undo the last change or discard. Nothing is stored until **Save as new recipe**, which saves straight to Recipes (and, when opened from the plan, takes that recipe's slot pinned if it still covers its servings), or **Replace original**, which confirms and opens the review form. Pin and loved are unavailable on an unsaved remix. The card's **US kitchen / Metric** toggle shares the grocery unit preference. Replacing a source-linked recipe makes it the household's own recipe (imported facts are dropped; the link is kept).
- Deterministic combination selection among likes only, with leftover and maximum-batch constraints, variety, effort, ingredient overlap and pantry consideration. Compact thumbnail recipe rows and the full recipe card offer pins (for planned recipes) and a "We loved this" / "Loved" toggle; there is no swap selector or "We cooked this" action. Pins preserve recipe/role when rebuilding. Recipes are not assigned to dates.
- Scaled, categorized groceries after plan confirmation. Compatible mass/volume units merge; incompatible dimensions and different ingredient names do not. Pantry is a persistent **At home** inventory, independent of the weekly plan. Matching ingredients are automatically crossed off and excluded from the shopping count, while their recipe quantities remain visible. Matching ignores case and repeated whitespace, but does not guess aliases or match substrings.
- Groceries show the ingredient first, then its amount. The **US kitchen / Metric** toggle defaults to US kitchen and saves your choice in this browser's local storage (`mealy-grocery-units`), independently of the shared household. It converts all displayed grocery quantities without changing arithmetic or shopping checks. Storage failures are shown explicitly. Pantry's header **+** opens one focused ingredient field; Enter or the add button saves and leaves the field ready for the next ingredient. Tap outside or press Escape to finish. There are no weekly suggestions, quantity fields, or week-reset controls in Pantry. Swipe left on an ingredient to reveal its remove button (keyboard: focus the row and press Left Arrow or Shift+F10). Removing it restores its grocery entries without clearing unrelated checks. Old quantity/note fields remain stored for compatibility but no longer determine pantry coverage. Checking off a purchase adds it to Pantry; its own checkbox remains reversible, and unchecking removes only stock created by that check. Starting a fresh week preserves Pantry.
- Household recipe creation/editing, complete ingredients/methods, optional private photos, durable explicit preferences and feedback events. Recipe editing invalidates a dependent plan; removing pantry stock clears shopping checks (removing an item that a grocery check added only unchecks that grocery). A fresh week preserves recipes, pantry and durable preferences.
- **Link a website** (Recipes → +): paste a public recipe page and the `recipe-draft` function fetches it server-side (https only, public hosts, redirect/size/time limits) and asks AI to extract its title, yield, time, ingredients and directions into a review form, with the link kept as the source. Nothing is saved until the household checks the form. Source-linked recipes waiting for review offer **Fill in with AI**, which rereads the page to resolve unclear amounts and add directions.
- Live state is polled every four seconds and on focus/reconnection. Atomic version-checked saves reject stale edits, reload the other phone's changes, and ask you to repeat your action rather than silently overwrite them.
- Hash-based tab URLs, `/mealy/` asset paths, install manifest and app-shell service worker. **Household data is not cached for offline use**; it requires internet.

**Not yet available:** in-app external recipe search. The bounded Tiffy facts snapshots contain no authored instructions or photographs; missing amounts and ranges require household review, with no guessed densities or package weights. See [source checks and facts-review behavior](docs/trusted-sources.md). Kitchen illustrations are not recipe photographs. Households start empty; available facts are added explicitly for matching saved links.

## Local development

Use Node 22.12+ (or a newer supported Node release).

```sh
npm ci
npm run dev
# http://127.0.0.1:5173/mealy/
```

Mealy requires Supabase and an authorized Google account; there is no demo mode or local recipe database. Copy `.env.example` to the ignored `.env.local` and set the project's public URL and publishable key. Missing configuration shows an explicit setup error.

For local development, run `npm run dev -- --port 5173 --strictPort` and open `http://127.0.0.1:5173/mealy/`. Add that exact URL to Supabase Auth's redirect allowlist, leaving the production site URL unchanged. Sign in normally; local edits affect the same real household. Old demo browser data is ignored and never uploaded. The production Edge Functions currently accept only their configured `APP_ORIGIN`; local AI requests require a separately configured local backend or an explicit server-side origin allowlist change, not a browser secret or a disabled origin check.

```sh
npm test                    # deterministic planning/arithmetic + actual SQL/RLS on PGlite
npx playwright install chromium webkit firefox
npm run test:e2e             # mobile Chrome/Safari flows, keyboard/pointer, accessibility
npm run build               # strict TypeScript + production app/service worker
npm run format:check
npm ci --prefix services/copilot
npm test --prefix services/copilot # isolated SDK gateway tests; no model calls
```

PGlite runs the real migration against PostgreSQL with minimal mocked `auth`/`storage` schemas. It checks allowed/denied access, stale writes, atomic events, image path isolation and rate limits. It does **not** substitute for testing hosted Google OAuth, Storage uploads or Supabase Edge Functions with real credentials. Browser tests build with a fake Supabase URL and intercept every external request using fixtures in `tests/fixtures/`. Fixtures and mock AI responses are not shipped in the app; tests never access the real household or make paid API requests.

Icons are committed build inputs; `npm run icons` regenerates them from the original SVG using Playwright Chromium.

## Configure the live two-person household

1. Create your own Supabase project. Do not send secrets in chat or commit them. Apply the files in `supabase/migrations/` in filename order with the SQL editor, or link the Supabase CLI project and run `supabase db push`.
2. In Google Cloud, create a Web OAuth client with `openid`, `email` and `profile` scopes. Configure the Supabase Google provider using that client ID/secret. Follow [Supabase's official Google guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). Add the Supabase callback URL shown by the provider configuration to Google's authorized redirect URIs.
3. Configure Supabase Auth's site URL and redirect allowlist for `https://evi-liu.github.io/mealy/`, and your local URL when developing. The browser uses PKCE and returns to the base path, before hash-tab navigation. Prefer exact URLs, not broad wildcard redirects.
4. Run `supabase/setup-household.sql` **once**, replacing the two example emails privately in the SQL editor. This creates a single empty household and two slots. Do not commit the edited file. Set the Google consent screen audience/test users appropriately while testing. Only confirmed Google identities matching the server-side allowlist can read/write the household; signing in by itself grants no access.
5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. A legacy public anon key also works here. These are **public client configuration**, not service-role secrets. Never prefix a Google secret, Supabase service-role key, or OpenAI key with `VITE_`.
6. Launch the app and continue with Google from both phones. Add your own recipes; then make a shared plan. Changes should appear on the second phone within four seconds or when it regains focus.

Changing/removing a `household_access` email revokes its data access on subsequent database/Storage requests. Previously signed image URLs can remain usable for their one-hour lifetime. The application cannot enumerate or modify invitations, self-join a household, directly update its document, or forge feedback actors. Authorization depends on `auth.uid()` and the confirmed server-side Google account record, not a public household ID.

An administrator can add a third sign-in account after applying `202610290001_third_household_account.sql`: insert its lowercase email into `household_access` with the existing household ID and slot `3`. Do not rerun household setup or overwrite an occupied slot. While Google OAuth is in Testing, also add the email to the Google Cloud project's Audience test users. Keep actual addresses out of Git. Login account count does not change the two-person serving calculations.

No Supabase service-role key is needed by the frontend **or** the ranking function. Storage is a private 5 MB JPEG/PNG/WebP bucket with household-path RLS. Replaced/uncommitted uploads are cleaned up when possible, and failures are surfaced. After a browser/network interruption, administrators may need to remove orphaned uploads.

The state document keeps the recipe library, bookmarks, settings, shared queue, choices, pantry, plan and checks in one atomic unit. It is not a multi-tenant SaaS schema, background sync queue or cooking calendar. Writes are limited to a 2 MB document; the typed client caps libraries at 200 recipes, 200 bookmarks, 300 stock entries and twelve shortlisted recipes. Events are immutable via client privileges, with a security-invoker evidence view. Temporary skips are excluded from durable preference evidence. Loved is a toggle; loving and un-loving are recorded as `loved` / `unloved` events (`202610300002_unloved_event.sql`); historical cooked feedback is preserved but no longer has a UI action.

## Households

Anyone signing in with a confirmed Google account can create a household from the setup screen, or join one by request (`202610300004_households.sql`). Membership stays in `household_access`, so `my_household()` and every row-level security policy are unchanged; a household has up to 8 members. In **Profile**, members see the household and its members, rename it, and **Add someone**: search existing Mealy users by name or Gmail (3+ characters, at most 8 matches) and send a join request. Requests never expire; the recipient accepts or declines from their Profile or setup screen.

Accepting a request while already in a household moves you (`202610300007_household_switching.sql`): if you were its only member it is **deactivated, not deleted**, otherwise its other members keep it. Leaving as the last member also deactivates. A household's owner (its creator; for older households, the first member) sees deactivated households under **Your other households** and can **Switch back**, which reactivates it with its week, recipes, pantry and sources and moves them out of their current household. All of this runs through checked security-definer functions tested on PGlite.

## Recipe catalog and recipe sources

Each household follows a list of **recipe sources** (Profile → Recipe sources), starting with Tiffy Cooks and The Woks of Life; any recipe site with a sitemap and structured recipe data can be added by its address. The `catalog-import` Edge Function reads each followed site's sitemap (preferring post or recipe sitemaps), preloads the newest recipes in batches of 15 (100 for the two original sites, 50 for sites a household adds), skips anything the site's robots.txt disallows, then checks weekly (Saturdays) for posts newer than the last check. It fetches politely (1.5 s apart, identifying user agent, host allowlist with redirect checks, size and time limits) and stores each recipe's title, yield, time, ingredient lines, **directions** and categories (household decision, 2026-10-30), never photographs. Recipes imported before directions were kept are backfilled 10 per site per run. The catalog is one shared, de-duplicated table in Supabase (`catalog_recipes`), never in this public repository; row-level security shows each household only recipes from the sites it follows.

The app parses catalog rows with the same ingredient parser as the Tiffy facts. Recipes whose every line parses (ignoring "to taste", "optional", "garnish", "pinch" lines) and that have a yield and time join the stack as **ready**: leftover-friendly with a maximum batch of twice the published yield, labelled and adjustable. Anything with ranges, missing amounts or unknown units waits under **Recipes → Recipe catalog** for a quick review; nothing is guessed. Desserts, drinks and sauces stay out of the dinner stack. Queued catalog recipes are copied into the household for the week; unedited copies return to the catalog at a fresh week unless loved or cooked.

Set up once, after applying the catalog migrations (`202610300003` to `202610300006`):

```sh
supabase functions deploy catalog-import
```

Then run `supabase/setup-catalog-cron.sql` once in the SQL editor with your project ref filled in. It enables `pg_cron`/`pg_net`, generates a random shared secret in Vault (no Edge Function secret to manage), and schedules the importer for **Saturdays only**, every 10 minutes from 09:00 to 10:50 UTC. The first Saturday finishes the preload in batches; afterwards the first Saturday run checks for new recipes and the rest return without visiting any site. `select cron.unschedule('catalog-import');` stops it.

## Optional AI ranking and recipe drafting

The app's planning and serving logic works without AI. Clicking **Use optional AI ranking** sends the current household's recipe titles, ingredient names, time/variety, pantry names and explicit loved IDs to a Supabase function, which calls the server-side **Copilot SDK gateway**. It can only reorder the supplied shortlist and explain that order. It cannot create recipes, quantities or a plan, nor override dislikes or serving constraints.

**Remix** (full recipe card) works the same way through `recipe-draft`, but the function loads the saved recipe itself from the household document by ID (including stored source facts for source-linked recipes) instead of trusting a copy from the browser. Highlights are computed in the app by comparing the saved recipe with the draft; the model's comments are attached where they match.

**Add with AI** (Recipes → +) sends the household's description, its earlier requests for that draft, and the current unsaved form contents to the `recipe-draft` function, which asks Copilot for one complete recipe in the app's units and categories. The answer is validated against the recipe bounds on the server and again in the browser; unusable answers are rejected rather than repaired. The model may decline unrelated or unsafe requests. Unlike ranking, this **does** produce model-written quantities, yields and steps: the form must be reviewed and an explicit acknowledgement checked before saving, and the recipe keeps an `aiDraft` provenance record (creation time and prompts). AI drafts are not kitchen-tested.

See [Copilot service setup and rollout](services/copilot/README.md). A persistent Node/container host is required alongside Supabase; the static frontend does not contain the SDK or credentials. Confirm the selected account's policy permits shared household usage. Configure its exact GitHub login and available model privately; the service refuses the wrong identity or an unavailable model and limits use to one explicitly approved household.

After hosting, account configuration, and deployment approval:

```sh
supabase secrets set APP_ORIGIN=https://evi-liu.github.io
# Set COPILOT_GATEWAY_URL and COPILOT_GATEWAY_TOKEN privately in Supabase.
supabase functions deploy rank-recipes
supabase functions deploy recipe-draft
```

`APP_ORIGIN` is an origin (no `/mealy/` path); use `http://127.0.0.1:5173` in a separate local configuration for local browser testing. Do not overwrite the production origin. `COPILOT_MODEL` is set on the gateway, with no default; account/model availability and real structured-output support must be verified before rollout. Existing `OPENAI_*` secrets are no longer read by these functions. There is no automatic OpenAI fallback or transfer of OpenAI billing to Copilot.

Both Edge Functions have gateway `verify_jwt=false` to support current Supabase signing keys, **but perform their own `auth.getUser(token)` authentication and household authorization on every request**. They use the caller's token with RLS, not a bypass key. Database-backed limits are 20 ranking calls and 60 drafting calls per household per hour (drafting needs `202610300001_ai_recipe_drafts.sql`). The Copilot service additionally requires a server-only gateway secret and checks the allowed household. Unconfigured providers, invalid model output, timeouts and rate limits return explicit errors; local deterministic ordering remains unchanged. Each request uses a fresh, tool-disabled SDK session, deleted afterward. Provider retention and usage remain subject to the Copilot account's policies.

For optional static Edge Function checking with Deno installed:

```sh
deno check supabase/functions/rank-recipes/index.ts supabase/functions/recipe-draft/index.ts supabase/functions/catalog-import/index.ts
```

No embeddings, vector database, fine-tuning, or chat-memory dependence is needed for this slice.

## Pages and installation

`npm run build` outputs `dist/` with base `/mealy/`. Hash navigation avoids Pages deep-link 404s; OAuth redirects target `/mealy/` itself. The service worker precaches only public app-shell assets, not authenticated API responses/photos. An update prompts for a reload instead of interrupting editing. Google sign-in and live state require connectivity.

The repository includes ordinary CI and a **manual-only** Pages workflow. Nothing auto-deploys on push. When deployment is separately approved:

1. Select **GitHub Actions** as the Pages source.
2. Set repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run **Publish Mealy (manual)**. Review/approve its `github-pages` environment as appropriate.
4. Verify the hosted Google callback, both-phone synchronization, denied-account access, and photo upload on the real origin. On iOS use Safari's **Share → Add to Home Screen**; on Android use the browser's install action.

Builds with no configuration show a setup error and cannot open a kitchen. Never treat a successful static build or local SQL test as proof that production Google/Supabase/OpenAI services are configured.

## Arithmetic and current boundaries

- Whole servings are allocated across liked dinner recipes and quantities scale automatically, without batch-size caps. The legacy `maxServings` field remains for stored-data/AI compatibility but never limits plans, swaps or remixes. Only recipes explicitly marked leftover-friendly supply lunches; Kairos remains a separate eight-serving, potluck-suitable dish.
- Ingredient quantities scale linearly from the original recipe yield. Planning never asks a model for cooking time, food safety, package sizes or substitutions; only an explicitly requested, household-reviewed AI draft contains model-written recipe content.
- Canonical units: grams, milliliters and each. Conversion uses 240 ml/cup, 15 ml/tbsp, 5 ml/tsp, 453.59237 g/lb and 28.349523125 g/oz. No cup-to-gram or ingredient alias guesses. Grocery display uses grams/kilograms and milliliters/liters in Metric, ounces/pounds and teaspoons/tablespoons/cups in US kitchen mode. Display rounds upward (one decimal for base metric units, three for kg/l, two for US units); internal totals and checklist identities never change. Existing measured pantry data is retained, while quick-add creates unknown-quantity staples.
- This version assumes both people travel together and need Monday-Friday lunches. There is no separate per-person travel calendar. Removing pantry entries clears shopping checks so a newly increased requirement cannot remain falsely checked; adding an unknown-quantity staple does not alter quantities or checks.
- The displayed plan is the saved week until **Start a fresh week** is explicitly confirmed. Historical plan snapshots are not yet exposed; durable learning events and preferences remain.
- Automated accessibility covers critical mobile screens; real-device installation, screen-reader use, real Google sign-in, actual hosted Storage and two-phone network failures still need deployment-environment acceptance checks.
