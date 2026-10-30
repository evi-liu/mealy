# Mealy

A mobile-first, installable React + TypeScript kitchen planner for one two-person household. Vite/static frontend, Base UI controls, Supabase Google authentication/Postgres/private Storage, and optional server-side OpenAI functions for shortlist ranking and recipe drafting. Intended Pages URL: `https://evi-liu.github.io/mealy/`.

## What works

- Sunday setup defaults to **two dinners, four dinner servings, ten leftover lunch servings**. Kairos adds a separate eight-serving dish. Travel and Kairos start off. The explicitly labeled weekday assumption removes two lunches per Monday-Friday away; weekends do not alter lunch needs.
- One shared shortlist of up to twelve recipes; like, temporary skip, undo, and explicit "don't recommend." Build unlocks on **viable serving coverage**, not simply a count of likes. You can continue swiping.
- Recipe cards can be dragged and thrown. A small dependency-free spring engine (`src/motion/`) carries a fling toward the **Like** or **Not this week** edge targets that appear while the card is held; pausing before letting go (or releasing away from a target) springs the card back without voting. Buttons stay available and play the same animation; reduced-motion settings skip animation.
- **Draft it with AI** at the top of **Add your recipe** describes a dish, fills the normal recipe form with an AI draft, and refines it from a text box at the bottom. Drafts stay on the device until the household reviews the form and saves. Saved drafts are labeled **AI-drafted**; demo mode uses a clearly labeled canned example instead of a model.
- Any recipe can be remixed from its full recipe card: type into **I want to remix this recipe...** and the remix animates in with added, removed and changed ingredients, steps and details highlighted (computed by the app, with the AI's comments attached). Keep refining, undo the last change or discard. Nothing is stored until **Save as new recipe**, which saves straight to Recipes (and, when opened from the plan, takes that recipe's slot pinned if it still covers its servings), or **Replace original**, which confirms and opens the review form. Pin and loved are unavailable on an unsaved remix. The card's **US kitchen / Metric** toggle shares the grocery unit preference. Replacing a source-linked recipe makes it the household's own recipe (imported facts are dropped; the link is kept).
- Deterministic combination selection among likes only, with leftover and maximum-batch constraints, variety, effort, ingredient overlap and pantry consideration. Compact thumbnail recipe rows and the full recipe card offer pins (for planned recipes) and a "We loved this" / "Loved" toggle; there is no swap selector or "We cooked this" action. Pins preserve recipe/role when rebuilding. Recipes are not assigned to dates.
- Scaled, categorized groceries after plan confirmation. Compatible mass/volume units merge; incompatible dimensions and different ingredient names do not. Measured inventory is deducted once. Unknown-quantity staples remain on the shopping list with a reminder.
- Groceries show the ingredient first, then its amount. The **US kitchen / Metric** toggle defaults to US kitchen and saves your choice in this browser's local storage (`mealy-grocery-units`), independently of the shared household. It converts all displayed grocery quantities without changing arithmetic or shopping checks. Storage failures are shown explicitly. Pantry quick-add is an ingredient field plus an optional "how much is left" note (e.g. half full); new entries mean "on hand, quantity unknown," not unlimited stock, and notes are never parsed into quantities. Pantry items can be renamed or have their note edited in place. Checking off a grocery adds it to the pantry as on hand (unchecking removes only what the check added), without changing that week's amounts.
- Household recipe creation/editing, complete ingredients/methods, optional private photos, durable explicit preferences and feedback events. Recipe editing invalidates a dependent plan; removing pantry stock clears shopping checks (removing an item that a grocery check added only unchecks that grocery). A fresh week preserves recipes, pantry and durable preferences.
- **Import from a link** (Recipes): paste any public recipe page and the `recipe-draft` function fetches it server-side (https only, public hosts, redirect/size/time limits) and asks AI to extract its title, yield, time, ingredients and directions into the Add recipe form, with the link kept as the source. Nothing is saved until the household checks the form. Source-linked recipes waiting for review offer **Fill in with AI**, which rereads the page to resolve unclear amounts and add directions. The Add recipe form now starts blank (no assumed yield, batch, time or ingredient). Earlier saved links stay listed with Import with AI.
- Live state is polled every four seconds and on focus/reconnection. Atomic version-checked saves reject stale edits, reload the other phone's changes, and ask you to repeat your action rather than silently overwrite them.
- Hash-based tab URLs, `/mealy/` asset paths, install manifest and app-shell service worker. **Live household data is not cached for offline use**; it requires internet. Demo mode is explicit and persists only in this browser.

**Not yet available:** in-app external recipe search. The bounded Tiffy facts snapshots contain no authored instructions or photographs; missing amounts and ranges require household review, with no guessed densities or package weights. See [source checks and facts-review behavior](docs/trusted-sources.md). The ten demo fixtures are original arithmetic/interaction examples, clearly marked **not tested cooking recipes**. Their kitchen illustrations are not recipe photographs. Live households start empty; available facts are added explicitly for matching saved links.

## Local development

Use Node 22.12+ (or a newer supported Node release).

```sh
npm ci
npm run dev
# http://127.0.0.1:5173/mealy/
```

Without public Supabase configuration, choose **Try the demo**. Live failures never switch into demo mode. Demo persistence errors are shown, with an explicit reset control. Demo and live data never merge.

```sh
npm test                    # deterministic planning/arithmetic + actual SQL/RLS on PGlite
npx playwright install chromium webkit firefox
npm run test:e2e             # mobile Chrome/Safari flows, keyboard/pointer, accessibility
npm run build               # strict TypeScript + production app/service worker
npm run format:check
```

PGlite runs the real migration against PostgreSQL with minimal mocked `auth`/`storage` schemas. It checks allowed/denied access, stale writes, atomic events, image path isolation and rate limits. It does **not** substitute for testing hosted Google OAuth, Storage uploads or Supabase Edge Functions with real credentials. Browser tests use explicit demo data and make no paid API requests.

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

## Recipe catalog and recipe sources

Each household follows a list of **recipe sources** (Profile → Recipe sources), starting with Tiffy Cooks and The Woks of Life; any recipe site with a sitemap and structured recipe data can be added by its address. The `catalog-import` Edge Function reads each followed site's sitemap (preferring post or recipe sitemaps), preloads the 100 newest recipes per site in batches of 15, then checks at most weekly for posts newer than the last check. It fetches politely (1.5 s apart, identifying user agent, host allowlist with redirect checks, size and time limits) and stores each recipe's title, yield, time, ingredient lines, **directions** and categories (household decision, 2026-10-30), never photographs. Recipes imported before directions were kept are backfilled 10 per site per run. The catalog is one shared, de-duplicated table in Supabase (`catalog_recipes`), never in this public repository; row-level security shows each household only recipes from the sites it follows.

The app parses catalog rows with the same ingredient parser as the Tiffy facts. Recipes whose every line parses (ignoring "to taste", "optional", "garnish", "pinch" lines) and that have a yield and time join the stack as **ready**: leftover-friendly with a maximum batch of twice the published yield, labelled and adjustable. Anything with ranges, missing amounts or unknown units waits under **Recipes → Recipe catalog** for a quick review; nothing is guessed. Desserts, drinks and sauces stay out of the dinner stack. Queued catalog recipes are copied into the household for the week; unedited copies return to the catalog at a fresh week unless loved or cooked.

Set up once, after applying the catalog migrations (`202610300003` to `202610300006`):

```sh
supabase functions deploy catalog-import
# Set CATALOG_CRON_SECRET (a long random string) as an Edge Function secret in the dashboard.
```

Then run `supabase/setup-catalog-cron.sql` in the SQL editor with your project ref and the same secret filled in (do not commit the edited file). It enables `pg_cron`/`pg_net`, stores both values in Vault and schedules an hourly tick; the function itself limits site visits to the preload batches and one weekly check. `select cron.unschedule('catalog-import');` stops it.

## Optional AI ranking and recipe drafting

The app's planning and serving logic works without AI. Clicking **Use optional AI ranking** sends the current household's recipe titles, ingredient names, time/variety, pantry names and explicit loved IDs to a server-side function, which calls OpenAI. It can only reorder the supplied shortlist and explain that order. It cannot create recipes, quantities or a plan, nor override dislikes or serving constraints.

**Remix** (full recipe card) works the same way through `recipe-draft`, but the function loads the saved recipe itself from the household document by ID (including stored source facts for source-linked recipes) instead of trusting a copy from the browser. Highlights are computed in the app by comparing the saved recipe with the draft; the model's comments are attached where they match.

**Draft it with AI** (Recipes → Add your recipe) sends the household's description, its earlier requests for that draft, and the current unsaved form contents to the `recipe-draft` function, which asks OpenAI for one complete recipe in the app's units and categories. The answer is validated against the recipe bounds on the server and again in the browser; unusable answers are rejected rather than repaired. The model may decline unrelated or unsafe requests. Unlike ranking, this **does** produce model-written quantities, yields and steps: the form must be reviewed and an explicit acknowledgement checked before saving, and the recipe keeps an `aiDraft` provenance record (creation time and prompts). AI drafts are not kitchen-tested.

Deploy with Supabase CLI after reviewing provider privacy/cost settings:

```sh
supabase secrets set APP_ORIGIN=https://evi-liu.github.io
# Set OPENAI_API_KEY and OPENAI_MODEL privately using the Supabase dashboard.
supabase functions deploy rank-recipes
supabase functions deploy recipe-draft
```

`APP_ORIGIN` is an origin (no `/mealy/` path); use `http://127.0.0.1:5173` for local browser testing. No model is silently defaulted. `OPENAI_MODEL` must name a model enabled for your API account that supports Responses structured JSON output. On 2026-10-28, the [official GPT-5.6 Terra page](https://developers.openai.com/api/docs/models/gpt-5.6-terra) documents API model ID `gpt-5.6-terra` and Responses support; availability for your account and cost still need confirmation. Previously suggested `GPT-6 Luna` API support has **not** been verified by this implementation. The older `gpt-4.1-mini` and `gpt-5-mini` pages were marked deprecated when checked; they are not hardcoded here.

Both Edge Functions have gateway `verify_jwt=false` to support current Supabase signing keys, **but perform their own `auth.getUser(token)` authentication and household authorization on every request**. They use the caller's token with RLS, not a bypass key. Database-backed limits are 20 ranking calls and 60 drafting calls per household per hour (drafting needs `202610300001_ai_recipe_drafts.sql`). Unconfigured providers, invalid model output, timeouts and rate limits return explicit errors; local deterministic ordering remains unchanged. Requests use `store:false`; this is not a promise of zero retention by the provider.

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

Builds with no configuration expose only the labeled demo. Never treat a successful static build or local SQL test as proof that production Google/Supabase/OpenAI services are configured.

## Arithmetic and current boundaries

- Whole servings are allocated across dinner recipes, no more than each recipe's user-entered maximum batch size. Only recipes explicitly marked leftover-friendly supply lunches. Potluck capacity is separate.
- Ingredient quantities scale linearly from the original recipe yield. Planning never asks a model for cooking time, food safety, package sizes or substitutions; only an explicitly requested, household-reviewed AI draft contains model-written recipe content.
- Canonical units: grams, milliliters and each. Conversion uses 240 ml/cup, 15 ml/tbsp, 5 ml/tsp, 453.59237 g/lb and 28.349523125 g/oz. No cup-to-gram or ingredient alias guesses. Grocery display uses grams/kilograms and milliliters/liters in Metric, ounces/pounds and teaspoons/tablespoons/cups in US kitchen mode. Display rounds upward (one decimal for base metric units, three for kg/l, two for US units); internal totals and checklist identities never change. Existing measured pantry data is retained, while quick-add creates unknown-quantity staples.
- This version assumes both people travel together and need Monday-Friday lunches. There is no separate per-person travel calendar. Removing pantry entries clears shopping checks so a newly increased requirement cannot remain falsely checked; adding an unknown-quantity staple does not alter quantities or checks.
- The displayed plan is the saved week until **Start a fresh week** is explicitly confirmed. Historical plan snapshots are not yet exposed; durable learning events and preferences remain.
- Automated accessibility covers critical mobile screens; real-device installation, screen-reader use, real Google sign-in, actual hosted Storage and two-phone network failures still need deployment-environment acceptance checks.
