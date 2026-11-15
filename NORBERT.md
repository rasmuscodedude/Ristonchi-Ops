# What Norberto needs to provide

The staff app is ready to run against sample data. These are the platform pieces it needs before a real desk can sign in. Nothing here should use a hostname other than `https://app.ristonchi.com` and `https://api.ristonchi.com`. The agent backend calls these from its host (Cloudflare or, later, Azure), so they must be reachable from the public internet, not only from the office network.

Set these on the agent when the endpoints exist:

```
AUTH_MODE=platform
PLATFORM_AUTH_URL=https://api.ristonchi.com
PLATFORM_MODE=mcp
PLATFORM_MCP_URL=https://api.ristonchi.com/mcp
```

The same staff token is used as the app session and as the bearer token on the MCP server.

## 1. Hosted MCP endpoint

`POST https://api.ristonchi.com/mcp`

Streamable HTTP MCP (protocol `2025-03-26`).

- Header `Authorization: Bearer <staff token>`
- Header `Accept: application/json, text/event-stream`
- Header `Mcp-Session-Id` after `initialize` returns one
- Methods the app calls: `initialize`, `notifications/initialized`, `tools/list`, `tools/call`

`tools/call` arguments are the tool's own arguments. For the six high-confirm tools below, the app adds `confirm: true` only after the signed-in person approves. It strips any `confirm` the model tried to send before that.

The tool names the agents are allowed to call are listed in `services/agent/src/policy.ts`. Please keep those names stable. A tool that is not on an agent's list is never called, even if `tools/list` returns it.

High-confirm tools (approval, then `confirm=true`):

- `generate_proposal_draft`
- `send_proposal`
- `create_contract`
- `release_outbox_message`
- `discard_outbox_message`
- `delete_reservation`

Every other write in the allowlist needs approval and must not require `confirm`.

Reads run immediately with the staff token. They must keep returning only data that token is allowed to see.

## 2. Per-staff API tokens

Each token is scoped to one staff member. The MCP server and the auth endpoints must refuse a token that belongs to someone else, and must refuse a token for a deactivated person.

The app stores the token only in the staff member's browser session or iOS keychain. It sends it to Norberto. It does not put it in the audit log.

## 3. Staff login and roles

`POST https://api.ristonchi.com/auth/staff/login`

```json
{ "email": "stefanie@ristonchi.com", "password": "..." }
```

`200`

```json
{
  "token": "opaque-staff-token",
  "staff": {
    "id": "usr_123",
    "email": "stefanie@ristonchi.com",
    "name": "Stefanie",
    "role": "manager",
    "flags": { "sales": true }
  }
}
```

`401` when the email or password is wrong.

`GET https://api.ristonchi.com/auth/staff/me` with `Authorization: Bearer <token>` returns `{ "staff": { ...same shape... } }`, or `401`.

`role` must be one of:

`admin`, `manager`, `event_coordinator`, `chef`, `server`, `sommelier`, `housekeeping`, `maintenance`, `reception`, `accountant`.

`flags.sales` is a boolean. It is not a role. The Sales / Couples agent is open to `admin`, `manager`, and anyone with `flags.sales: true` (so Stefanie keeps it even if her role changes, as long as the flag stays). The Wedding-day agent is open to `admin`, `manager`, and `event_coordinator`. The audit log is open to `admin` only.

A revoke endpoint is not required yet. Signing out drops the token on the device. Tell us when you have a revoke URL and we will call it.

## 4. Activity log

`GET https://api.ristonchi.com/activity?limit=100` with the same bearer token.

This is the platform's own `list_activity` feed. The staff app already keeps its own audit log of assistant tool calls (who, agent, tool, arguments, approved or not, result, time). The platform feed is how we later reconcile assistant actions with everything else that happened in Norberto.

Suggested row:

```json
{
  "entries": [
    {
      "id": "act_123",
      "at": "2026-11-15T12:00:00Z",
      "actor_id": "usr_123",
      "action": "send_proposal",
      "subject_id": "501",
      "summary": "Proposal 501 scheduled"
    }
  ]
}
```

`list_activity` is not on either agent's allowlist. The model cannot call it. An admin view can read this endpoint later, once it exists.

## House style the tools already enforce

Couple-facing text uses `1,000€`, says "first payment", and does not use em dashes. The assistants are instructed not to promise that a date is available, and not to put a price or a fact into a write unless a read in that conversation returned it. Tool schemas should keep prices out of write arguments wherever Norberto can fill them itself, as `create_proposal` already does.
