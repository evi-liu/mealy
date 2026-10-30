# Mealy Copilot service

The static frontend still calls Supabase. The `recipe-draft` and `rank-recipes`
Edge Functions authenticate the Google user, check household membership, enforce
database-backed hourly limits, and load the authorized recipe data. Only then do
they call this Node service using a separate gateway secret. This service uses
the official `@github/copilot-sdk`, not an OpenAI key or an undocumented endpoint.

## Account and hosting prerequisites

- Confirm your organization permits the selected Copilot entitlement to serve
  this shared personal app. A work email or an "unlimited" allowance is not proof
  of permission, model access, or exemption from rate limits.
- Use a supported GitHub credential with Copilot access, configured privately on
  the server. Follow [SDK authentication](https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate).
  Do not extract tokens from the Copilot desktop app, commit credentials, or
  send credentials through chat. The service deliberately does not inherit a
  developer's CLI login or `gh` credentials.
- `COPILOT_EXPECTED_LOGIN` is the GitHub username for the intended identity,
  not its email. Startup refuses an unauthenticated or mismatched identity.
- Choose `COPILOT_MODEL` from that account's available models. Startup checks
  availability; a real structured-output request must still be verified before
  production. There is no model default, provider fallback, or automatic retry.
- Hosting must support a persistent Node process and the bundled Copilot runtime.
  GitHub Pages and Supabase Edge Functions are not hosts for that process.
  Deploy behind HTTPS on a container/VM host; the browser never contacts it.

## Local setup

```sh
cd services/copilot
npm ci
cp .env.example .env
# Fill the ignored .env privately after account/policy approval.
npm test
npm start
```

`npm test` builds and uses only mocked model calls. `npm start` starts the SDK
runtime and checks identity/model availability, but does not generate a recipe.
The listener defaults to loopback port 8787. `GET /health` reports readiness;
`POST /generate` requires the gateway secret and matching `MEALY_HOUSEHOLD_ID`.
Only one explicitly configured household can use this account's allowance,
even if other households exist in Supabase. Authentication failures, wrong
households and invalid requests never start model generation.

In Supabase Secrets configure:

| Secret                  | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| `APP_ORIGIN`            | The existing approved browser origin, without a path |
| `COPILOT_GATEWAY_URL`   | HTTPS base URL of this service, without `/generate`  |
| `COPILOT_GATEWAY_TOKEN` | Same random secret as `MEALY_GATEWAY_TOKEN`          |

Keep all service credentials out of `VITE_*`. The Copilot credential exists
only on this service, not in Supabase or the browser. The gateway token is not
a Supabase service-role key. Existing `OPENAI_*` secrets are unused by the new
functions; do not delete them until a deliberate rollout/rollback decision.

For **local Edge Functions**, an HTTP loopback gateway is permitted.
`127.0.0.1` in a hosted Edge Function is that remote host, not your laptop:
the hosted application needs an HTTPS-reachable deployed gateway. Keep the
production `APP_ORIGIN` intact; use a separate local Supabase configuration
when testing localhost.

## Deployment and rollout

A Dockerfile is provided for a host of your choice:

```sh
docker build -t mealy-copilot services/copilot
# Set the server-only environment variables privately on the selected host.
```

No hosting provider, billing, credential, or deployment is configured by this
change. With deployment authorization, start the gateway, verify `/health`,
configure Supabase Secrets, then deploy **both** functions:

```sh
supabase functions deploy recipe-draft
supabase functions deploy rank-recipes
```

After explicit approval for entitlement-consuming calls, check hosted drafting,
remixing/importing, and ranking using the approved household. Invalid recipes
must remain unsaved and rankings must still contain exactly the supplied IDs.
A source import continues to use the existing server-side page fetch safeguards.
Do not expose the CLI runtime's transport port publicly.

## Isolation, limits and retention

Each generation uses a new SDK session in `mode: "empty"`, with structured JSON
output, no tools, denied permissions, no skills/hooks/git discovery, no shared
session store or embedding retrieval. The service never gives the model access
to the filesystem, shell, credentials, or arbitrary network tools. The Edge
Functions still validate the recipe/ranking domain constraints; schema output
alone is not trusted.

Two concurrent requests maximum; bodies are bounded to 256 KB. Generation has a
40-second SDK wait and a 45-second request cancellation deadline. Client
disconnects cancel work. Failed calls are not retried automatically. Aborted or
finished sessions are deleted, and the isolated runtime directory is removed
on graceful shutdown. A process crash can leave a temporary directory, so use
ephemeral container storage and exclude it from backups. This is not a promise
of zero provider retention: data is processed under the configured Copilot
account's organization policies.

Logs contain generic error categories, not prompts, keys, or raw provider errors.
If the UI reports Copilot unavailable, check account authentication, permitted
models, organization policy and quota in the provider's admin tools. Changing
to Copilot does not itself guarantee unlimited or free service.
