# Ristonchi Staff

A staff-only assistant for [Castello di Ristonchi](https://app.ristonchi.com). People sign in with their Norberto account and talk to the desk they work: Sales / Couples, or the wedding-day coordinator. The assistant reads Norberto immediately. Anything that would change a couple, a date, or the house stops and waits for that person to approve it.

The product name is one constant, `APP_NAME`, in `packages/shared/src/brand.ts`. The placeholder is **Ristonchi Staff**.

```
apps/web            Staff web app
apps/ios            SwiftUI app (signed later on a Mac)
services/agent      Chat API, for Cloudflare Workers or a Node process
packages/shared     Name, roles, and API types
```

The model, the platform, and storage sit behind interfaces in `services/agent`, so the same API can move from Cloudflare to Azure without rewriting the gate.

## Architecture

```
staff  ->  web or iOS  ->  agent API  ->  LLM provider
                              |
                              +-> allowlist for the role
                              +-> read tools run at once
                              +-> write tools return an approval card
                              +-> audit log
                              |
                              +-> Norberto MCP (api.ristonchi.com)
                                  or the local mock
```

Login is an `AuthAdapter`. Today `AUTH_MODE=mock` accepts four demo accounts. `AUTH_MODE=platform` calls the login contract in `NORBERT.md`.

Tools are a `PlatformAdapter`. `PLATFORM_MODE=mock` (the default) serves fictional weddings. `PLATFORM_MODE=mcp` speaks streamable HTTP MCP at `PLATFORM_MCP_URL`, with the staff member's own token.

The model is an `LlmProvider`: `mock` (no key, deterministic), `openai` (any OpenAI-compatible chat API), or `azure`.

Storage is a `Store`. Local dev keeps it in memory. A Cloudflare KV implementation is included for later. KV is eventually consistent, so it is not a safe lock for approvals. Put a strongly consistent store behind `Store` (D1, a Durable Object, or Azure) before this handles real couples.

High-confirm tools (`generate_proposal_draft`, `send_proposal`, `create_contract`, `release_outbox_message`, `discard_outbox_message`, `delete_reservation`) receive `confirm=true` only after approval. The model cannot set that flag itself.

System prompts forbid putting a price or a fact into a write unless a read in that conversation returned it.

## Local development

Requirements: Node 22.

```bash
npm install
cp .env.example .env   # optional, the defaults already use the mock
npm run dev
```

- Web: http://localhost:5173
- API: http://127.0.0.1:8787

`npm run dev` starts both. The web app proxies `/api` to the API.

Demo password: `ristonchi-demo`

| Email                     | Who             | Can open                        |
| ------------------------- | --------------- | ------------------------------- |
| stefanie@ristonchi.com    | Stefanie, sales | Sales / Couples and Wedding-day |
| coordinator@ristonchi.com | Wedding desk    | Wedding-day                     |
| admin@ristonchi.com       | Venue admin     | Both, plus the audit log        |
| kitchen@ristonchi.com     | Kitchen         | Nothing. Shows the role gate.   |

Try this as Stefanie:

1. Ask "Which couples have a proposal waiting?" The assistant calls `list_proposals` and answers from that result.
2. Ask "Send the Varga proposal". An approval card appears. Norberto (the mock) has not sent it.
3. Approve. The proposal moves to scheduled, and `confirm=true` is sent because `send_proposal` is high-confirm.
4. Sign in as the admin and open Audit. The read and the approved write are both there.

Rejecting a card does not call the tool. Tests cover that, and the allowlist (sales cannot file an incident, the coordinator cannot send a proposal).

Mock mode is for this machine. Do not deploy it.

### A real model

In `.env`:

```
LLM_PROVIDER=openai
LLM_API_KEY=...
LLM_MODEL=gpt-4o-mini
```

Or `LLM_PROVIDER=azure` with `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_KEY`.

### Norberto, when it is ready

See `NORBERT.md`. In short: `AUTH_MODE=platform`, `PLATFORM_MODE=mcp`, and the URLs `https://api.ristonchi.com` and `https://api.ristonchi.com/mcp`.

## Tests

```bash
npm test
npm run check    # prettier, eslint, typecheck, tests
```

## Cloudflare

The Worker entry is `services/agent/src/worker.ts`. Config is `services/agent/wrangler.jsonc` (compatibility date 2026-11-15, logs and traces on).

```bash
cd services/agent
npx wrangler login
npx wrangler secret put LLM_API_KEY          # only if you leave the mock
npx wrangler deploy
```

The checked-in vars keep mock mode, so a first deploy does not need secrets and does not talk to production. Switch `AUTH_MODE` and `PLATFORM_MODE` only when `NORBERT.md` is implemented. Add an `AUDIT_KV` binding when you want the log to outlive the isolate, and replace it with a consistent store before real approvals.

Local Worker preview, after the web build:

```bash
npm run dev:worker
```

The web app is a static Vite build. For a split deploy, set `VITE_API_URL` to the Worker origin and `WEB_ORIGIN` on the Worker to the web origin.

## iOS

`apps/ios` is a SwiftUI app for iOS 17. It cannot be built on Linux. On a Mac:

```bash
cd apps/ios
bundle install
open RistonchiStaff.xcodeproj
```

The login screen asks for the API base URL. The simulator default is `http://127.0.0.1:8787`.

TestFlight uses Fastlane and an App Store Connect API key. The team id placeholder is `TEAMIDPLACEHOLDER`. Replace it. Do not commit the `.p8`.

```bash
export APPLE_TEAM_ID=YOURTEAMID
export ASC_KEY_ID=...
export ASC_ISSUER_ID=...
export ASC_PRIVATE_KEY_BASE64="$(base64 < AuthKey_XXXX.p8)"
bundle exec fastlane beta
```

## Repo settings to apply

These are GitHub settings, not files. The workflows, Dependabot config, CODEOWNERS, and templates in this repo are already in place.

- [ ] Branch protection or a ruleset on `main`: require a pull request before merging, require the CI checks (`Secret scan`, `Commit messages`, `Lint, typecheck, test`), and block force pushes.
- [ ] Secret scanning and push protection (Settings, Code security).
- [ ] Dependabot alerts, plus Dependabot security updates if you want version bumps opened for you. The weekly npm and GitHub Actions config is already in `.github/dependabot.yml`.
- [ ] Switch the repository visibility to private.

On the GitHub Free plan, branch protection, CODEOWNERS reviews, and secret scanning are available while the repository is public. After it is private, confirm those toggles are still offered on the plan. Private branch protection and enforced CODEOWNERS need GitHub Pro or Team. Until then, merge to `main` only through a pull request with green CI.

## Open items for Norbert

Tracked in `NORBERT.md`:

- A hosted MCP endpoint the agent backend can reach
- A per-staff token
- `POST /auth/staff/login` and `GET /auth/staff/me`, with platform roles and a sales flag
- `GET /activity` (`list_activity`) so the admin log can later be reconciled with the platform
