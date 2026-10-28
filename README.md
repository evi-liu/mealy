# Mealy

A mobile-first, installable React + TypeScript kitchen planner for one two-person household. Vite/static frontend, Base UI controls, Supabase Google authentication/Postgres/private Storage, and an optional server-side OpenAI ranking function. Intended Pages URL: `https://evi-liu.github.io/mealy/`.

## What works

- Sunday setup defaults to **two dinners, four dinner servings, ten leftover lunch servings**. Kairos adds a separate eight-serving dish. Travel and Kairos start off. The explicitly labeled weekday assumption removes two lunches per Monday-Friday away; weekends do not alter lunch needs.
- One shared shortlist of up to twelve recipes; like, temporary skip, undo, and explicit "don't recommend." Build unlocks on **viable serving coverage**, not simply a count of likes. You can continue swiping.
- Deterministic combination selection among likes only, with leftover and maximum-batch constraints, variety, effort, ingredient overlap and pantry consideration. Compact thumbnail recipe rows retain pins and "We loved this"; there is no swap selector or "We cooked this" action. Pins preserve recipe/role when rebuilding. Recipes are not assigned to dates.
- Scaled, categorized groceries after plan confirmation. Compatible mass/volume units merge; incompatible dimensions and different ingredient names do not. Measured inventory is deducted once. Unknown-quantity staples remain on the shopping list with a reminder.
- Groceries show the ingredient first, then its amount. The **US kitchen / Metric** toggle defaults to US kitchen and saves your choice in this browser's local storage (`mealy-grocery-units`), independently of the shared household. It converts all displayed grocery quantities without changing arithmetic or shopping checks. Storage failures are shown explicitly. Pantry quick-add is one ingredient field plus a button; new entries mean "on hand, quantity unknown," not unlimited stock.
- Household recipe creation/editing, complete ingredients/methods, optional private photos, durable explicit preferences and feedback events. Recipe editing invalidates a dependent plan; removing pantry stock clears shopping checks. A fresh week preserves recipes, pantry and durable preferences.
- Trusted-source links for **The Woks of Life** and **Tiffy Cooks**, a paste-a-link bookmark flow, and reviewed manual entry of the user's own recipe details with source attribution. Link-only bookmarks cannot enter a plan until complete quantities and serving yields exist.
- Live state is polled every four seconds and on focus/reconnection. Atomic version-checked saves reject stale edits, reload the other phone's changes, and ask you to repeat your action rather than silently overwrite them.
- Hash-based tab URLs, `/mealy/` asset paths, install manifest and app-shell service worker. **Live household data is not cached for offline use**; it requires internet. Demo mode is explicit and persists only in this browser.

**Not yet available:** automated source extraction or in-app external recipe search. The initial scope is go-tos plus trusted-source links, not a generic API subscription. No third-party recipe content or pretend import results are included. See [source permission checks and bookmark behavior](docs/trusted-sources.md). The ten demo fixtures are original arithmetic/interaction examples, clearly marked **not tested cooking recipes**. Their kitchen illustrations are not recipe photographs. Live households start empty.

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
npx playwright install chromium webkit
npm run test:e2e             # mobile Chrome/Safari flows, keyboard/pointer, accessibility
npm run build               # strict TypeScript + production app/service worker
npm run format:check
```

PGlite runs the real migration against PostgreSQL with minimal mocked `auth`/`storage` schemas. It checks allowed/denied access, stale writes, atomic events, image path isolation and rate limits. It does **not** substitute for testing hosted Google OAuth, Storage uploads or Supabase Edge Functions with real credentials. Browser tests use explicit demo data and make no paid API requests.

Icons are committed build inputs; `npm run icons` regenerates them from the original SVG using Playwright Chromium.

## Configure the live two-person household

1. Create your own Supabase project. Do not send secrets in chat or commit them. Apply `supabase/migrations/202610280001_household.sql` with the SQL editor, or link the Supabase CLI project and run `supabase db push`.
2. In Google Cloud, create a Web OAuth client with `openid`, `email` and `profile` scopes. Configure the Supabase Google provider using that client ID/secret. Follow [Supabase's official Google guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google). Add the Supabase callback URL shown by the provider configuration to Google's authorized redirect URIs.
3. Configure Supabase Auth's site URL and redirect allowlist for `https://evi-liu.github.io/mealy/`, and your local URL when developing. The browser uses PKCE and returns to the base path, before hash-tab navigation. Prefer exact URLs, not broad wildcard redirects.
4. Run `supabase/setup-household.sql` **once**, replacing the two example emails privately in the SQL editor. This creates a single empty household and two slots. Do not commit the edited file. Set the Google consent screen audience/test users appropriately while testing. Only confirmed Google identities matching the server-side allowlist can read/write the household; signing in by itself grants no access.
5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. A legacy public anon key also works here. These are **public client configuration**, not service-role secrets. Never prefix a Google secret, Supabase service-role key, or OpenAI key with `VITE_`.
6. Launch the app and continue with Google from both phones. Add your own recipes; then make a shared plan. Changes should appear on the second phone within four seconds or when it regains focus.

Changing/removing a `household_access` email revokes its data access on subsequent database/Storage requests. Previously signed image URLs can remain usable for their one-hour lifetime. The application cannot enumerate or modify invitations, self-join a household, directly update its document, or forge feedback actors. Authorization depends on `auth.uid()` and the confirmed server-side Google account record, not a public household ID.

No Supabase service-role key is needed by the frontend **or** the ranking function. Storage is a private 5 MB JPEG/PNG/WebP bucket with household-path RLS. Replaced/uncommitted uploads are cleaned up when possible, and failures are surfaced. After a browser/network interruption, administrators may need to remove orphaned uploads.

The state document keeps the recipe library, bookmarks, settings, shared queue, choices, pantry, plan and checks in one atomic unit. It is not a multi-tenant SaaS schema, background sync queue or cooking calendar. Writes are limited to a 2 MB document; the typed client caps libraries at 200 recipes, 200 bookmarks, 300 stock entries and twelve shortlisted recipes. Events are immutable via client privileges, with a security-invoker evidence view. Temporary skips are excluded from durable preference evidence. Explicit loved flags record first-time feedback; historical cooked feedback is preserved but no longer has a UI action.

## Optional AI ranking

The app's planning and serving logic works without AI. Clicking **Use optional AI ranking** sends the current household's recipe titles, ingredient names, time/variety, pantry names and explicit loved IDs to a server-side function, which calls OpenAI. It can only reorder the supplied shortlist and explain that order. It cannot create recipes, quantities or a plan, nor override dislikes or serving constraints.

Deploy with Supabase CLI after reviewing provider privacy/cost settings:

```sh
supabase secrets set APP_ORIGIN=https://evi-liu.github.io
# Set OPENAI_API_KEY and OPENAI_MODEL privately using the Supabase dashboard.
supabase functions deploy rank-recipes
```

`APP_ORIGIN` is an origin (no `/mealy/` path); use `http://127.0.0.1:5173` for local browser testing. No model is silently defaulted. `OPENAI_MODEL` must name a model enabled for your API account that supports Responses structured JSON output. On 2026-10-28, the [official GPT-5.6 Terra page](https://developers.openai.com/api/docs/models/gpt-5.6-terra) documents API model ID `gpt-5.6-terra` and Responses support; availability for your account and cost still need confirmation. Previously suggested `GPT-6 Luna` API support has **not** been verified by this implementation. The older `gpt-4.1-mini` and `gpt-5-mini` pages were marked deprecated when checked; they are not hardcoded here.

The Edge Function has gateway `verify_jwt=false` to support current Supabase signing keys, **but performs its own `auth.getUser(token)` authentication and household authorization on every request**. It uses the caller's token with RLS, not a bypass key, and a database-backed limit of 20 calls/household/hour. Unconfigured providers, invalid model output, timeouts and rate limits return explicit errors; local deterministic ordering remains unchanged. Requests use `store:false`; this is not a promise of zero retention by the provider.

For optional static Edge Function checking with Deno installed:

```sh
deno check supabase/functions/rank-recipes/index.ts
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
- Ingredient quantities scale linearly from the original recipe yield. Cooking time, food safety, package sizes and substitutions are **not** inferred by a model.
- Canonical units: grams, milliliters and each. Conversion uses 240 ml/cup, 15 ml/tbsp, 5 ml/tsp, 453.59237 g/lb and 28.349523125 g/oz. No cup-to-gram or ingredient alias guesses. Grocery display uses grams/kilograms and milliliters/liters in Metric, ounces/pounds and teaspoons/tablespoons/cups in US kitchen mode. Display rounds upward (one decimal for base metric units, three for kg/l, two for US units); internal totals and checklist identities never change. Existing measured pantry data is retained, while quick-add creates unknown-quantity staples.
- This version assumes both people travel together and need Monday-Friday lunches. There is no separate per-person travel calendar. Removing pantry entries clears shopping checks so a newly increased requirement cannot remain falsely checked; adding an unknown-quantity staple does not alter quantities or checks.
- The displayed plan is the saved week until **Start a fresh week** is explicitly confirmed. Historical plan snapshots are not yet exposed; durable learning events and preferences remain.
- Automated accessibility covers critical mobile screens; real-device installation, screen-reader use, real Google sign-in, actual hosted Storage and two-phone network failures still need deployment-environment acceptance checks.
