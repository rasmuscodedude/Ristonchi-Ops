# Security

Ristonchi Staff is a private tool for venue staff. It can read and, after a person approves, change reservations, proposals, contracts, and the wedding day.

## Reporting

Report a vulnerability in private to the directors of Sant'Egidio Castello Ristonchi SRL. Do not open a public GitHub issue, and do not include customer records, tokens, or a working exploit in the report.

## What we expect from a deployment

- `AUTH_MODE=platform` and `PLATFORM_MODE=mcp`. Mock mode is for local development only.
- Model keys live in the host's secret store (`wrangler secret` or the Azure equivalent), never in git.
- The audit log is restricted to the `admin` role.
- A write tool does not run until the signed-in staff member approves it. High-confirm tools receive `confirm=true` only at that moment.

## Secrets in this repository

CI runs gitleaks on every pull request and on `main`. `.env.example` contains empty secrets and one shared demo password, `ristonchi-demo`, which is not a credential for Norberto.
