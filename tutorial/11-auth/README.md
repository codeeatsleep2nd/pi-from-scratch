# Chapter 11 — Auth (API Key vs OAuth Token)

## Goal

Allow the agent to authenticate with Anthropic using either a **paid API key**
or an **OAuth token** from your Claude Pro/Max subscription — with no external
tools required. This chapter is self-contained: it implements its own login
flow and credential storage.

## The problem

The Anthropic API has two authentication modes:

| Mode | When to use | Token format |
|------|-------------|-------------|
| API key | You have API credits at console.anthropic.com | `sk-ant-api03-...` |
| OAuth token | You have a Claude Pro or Max subscription | `sk-ant-oat01-...` |

Chapters 05–10 hardcoded `new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })`.
That fails with _"Your credit balance is too low"_ if you only have a subscription.

## How OAuth tokens work

Anthropic supports standard OAuth 2.0 with PKCE. The flow:

1. Open `https://claude.ai/oauth/authorize?...` in a browser
2. The user logs in and approves access
3. Anthropic redirects back to `http://localhost:54321/callback?code=...`
4. Exchange the code for access + refresh tokens at `https://platform.claude.com/v1/oauth/token`

The access token (`sk-ant-oat01-...`) is passed to the SDK as a Bearer token
instead of an API key:

```typescript
// API key (standard)
new Anthropic({ apiKey: "sk-ant-api03-..." })

// OAuth token
new Anthropic({
  apiKey: "placeholder",      // SDK requires a non-empty string even when unused
  authToken: "sk-ant-oat01-...",  // sent as "Authorization: Bearer <token>"
  baseURL: "https://api.anthropic.com",
  defaultHeaders: {
    "anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
    "user-agent": "claude-cli/2.0.0",
    "x-app": "cli",
  },
})
```

The `anthropic-beta: "claude-code-20250219,oauth-2025-04-20"` header is
**required** — without it the API rejects OAuth tokens.

## Files for this chapter

| File | What to do |
|------|------------|
| `src/login.ts` | Create — copy from [`src/login.ts`](./src/login.ts) |
| `src/auth.ts` | Create — copy from [`src/auth.ts`](./src/auth.ts) |
| `src/providers/anthropic.ts` | **Replace** with [`src/providers/anthropic.ts`](./src/providers/anthropic.ts) |
| `test/auth.test.ts` | Create — copy from [`test/auth.test.ts`](./test/auth.test.ts) |

The only change to `src/providers/anthropic.ts` is that the constructor now
accepts an optional `client?: Anthropic` parameter. When provided, it uses
that client instead of creating its own.

## Credential priority

`resolveAuth()` checks three sources in order:

1. `ANTHROPIC_OAUTH_TOKEN` env var — set this to use a token directly
2. `~/.config/pi-from-scratch/auth.json` — written by `src/login.ts`
3. `ANTHROPIC_API_KEY` env var — traditional paid API key

## How to log in (Claude Pro/Max)

Run the login script once. It opens your browser, completes the OAuth flow,
and saves the token to disk:

```bash
npx tsx src/login.ts
```

Expected output:

```
Opening browser for Anthropic login...

Waiting for OAuth callback on port 54321...
Exchanging code for tokens...
Credentials saved to /Users/you/.config/pi-from-scratch/auth.json

Login successful! Run your agent — it will pick up the token automatically.
```

After this, every call to `createAnthropicProvider()` reads the saved token
automatically — no env var needed.

## How to run the demo

```bash
# Works with OAuth token (from login.ts or ANTHROPIC_OAUTH_TOKEN) or API key
npx tsx src/auth.ts
```

Expected output:

```
[auth] Using oauth credentials
Streaming response:

Hello there friend

Done!
Tokens: 18 in / 5 out
```

## Using it in your code

Replace the manual provider construction with:

```typescript
import { createAnthropicProvider } from "./auth.js"

const provider = createAnthropicProvider()
```

If no credentials are found it throws a clear error:

```
No Anthropic credentials found.
Options:
  1. Run `npx tsx src/login.ts` to log in with your Claude Pro/Max subscription
  2. Set ANTHROPIC_OAUTH_TOKEN=<your-token> in your environment
  3. Set ANTHROPIC_API_KEY=<your-key> in your environment
```

## Token expiry

OAuth access tokens expire after about 1 hour. `readStoredToken()` checks the
`expires` timestamp and returns `undefined` for expired tokens. Re-run the
login script to get a fresh token:

```bash
npx tsx src/login.ts
```

## Debugging tips

- **"Your credit balance is too low"**: You have an API key but no credits. Run `npx tsx src/login.ts` to use your subscription instead.
- **Browser does not open automatically**: Copy the URL printed to the terminal and open it manually.
- **Port 54321 already in use**: Kill whatever is using that port (`lsof -i :54321`) and retry.
- **"anthropic-beta header required"**: You passed an OAuth token without the `claude-code-20250219,oauth-2025-04-20` beta header — use `createAnthropicClient()` instead of constructing the client manually.

## Tests

Run from `pi-from-scratch/`:

```bash
npx vitest --run test/auth.test.ts
```

Tests cover credential priority, token detection, and stored credential shape —
no API calls or login needed.

---

Next: [Chapter 10 — Interactive Mode](../10-interactive-mode/README.md) ← go back and wire auth in
