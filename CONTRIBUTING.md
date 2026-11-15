# Contributing

This repository is the staff assistant for Castello di Ristonchi. It is proprietary to Sant'Egidio Castello Ristonchi SRL. See `LICENSE`.

## Setup

```bash
npm install
npm test
npm run dev
```

Sign in as `stefanie@ristonchi.com` with the demo password in `.env.example`. The app runs on sample weddings. Do not point it at real couples unless you are an authorised staff member using a real Norberto token.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`.

Scopes: `agent`, `web`, `ios`, `shared`, `repo`.

Examples:

```
feat(agent): hold send_proposal until staff approve
fix(web): keep the approval card after a refresh
docs: list the login contract Norbert needs to ship
```

The subject is imperative, has no trailing period, and stays within 100 characters. Wrap each body line at 100 characters too. Pull request titles follow the same form. CI checks the commits on the pull request.

## Pull requests

Open a pull request against `main`. Fill in the template. CI must be green: secret scan, lint, typecheck, and tests.

Do not commit:

- `.env`, `.dev.vars`, or App Store Connect keys
- real reservations, guest lists, prices, or staff passwords
- hostnames other than `app.ristonchi.com` and `api.ristonchi.com`

## Where things live

| Path              | What                                           |
| ----------------- | ---------------------------------------------- |
| `services/agent`  | Chat API, allowlists, approval gate, audit log |
| `apps/web`        | Staff web app                                  |
| `apps/ios`        | SwiftUI app and Fastlane                       |
| `packages/shared` | Product name, roles, and the API types         |

The product name is the constant `APP_NAME` in `packages/shared/src/brand.ts`.

## Checks

```bash
npm run check
```

That runs Prettier, ESLint, typecheck, and tests. iOS is not built here. It is signed on a Mac.
