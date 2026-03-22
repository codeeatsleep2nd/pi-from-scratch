/**
 * Chapter 11 — Auth
 *
 * Resolves Anthropic credentials and returns a ready-to-use provider.
 *
 * Priority:
 *   1. ANTHROPIC_OAUTH_TOKEN env var  — set this to use an OAuth token directly
 *   2. ~/.config/pi-from-scratch/auth.json — written by `npx tsx src/login.ts`
 *   3. ANTHROPIC_API_KEY env var       — traditional paid API key
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import type { Provider } from "./ai.js"
import { AnthropicProvider } from "./providers/anthropic.js"
import type { StoredCredentials } from "./login.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthMode = "oauth" | "api-key"

export interface AuthResult {
	mode: AuthMode
	token: string
}

// ---------------------------------------------------------------------------
// Reading stored credentials
// ---------------------------------------------------------------------------

const AUTH_FILE = join(homedir(), ".config", "pi-from-scratch", "auth.json")

/**
 * Read the token saved by `npx tsx src/login.ts`.
 * Returns undefined if the file is absent, malformed, or expired.
 */
export function readStoredToken(): string | undefined {
	if (!existsSync(AUTH_FILE)) return undefined

	try {
		const creds = JSON.parse(readFileSync(AUTH_FILE, "utf8")) as StoredCredentials
		if (!creds.access || !creds.expires) return undefined

		if (Date.now() >= creds.expires) {
			console.warn("[auth] Stored token has expired — run `npx tsx src/login.ts` to refresh")
			return undefined
		}

		return creds.access
	} catch {
		return undefined
	}
}

// ---------------------------------------------------------------------------
// Token detection
// ---------------------------------------------------------------------------

/**
 * Returns true for Anthropic OAuth tokens (start with "sk-ant-oat").
 * Used to decide which client constructor to use.
 */
export function isOAuthToken(token: string): boolean {
	return token.startsWith("sk-ant-oat")
}

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

/**
 * Find the best available credentials.
 * Returns null if nothing is configured.
 */
export function resolveAuth(): AuthResult | null {
	// 1. Explicit OAuth token env var
	const oauthEnv = process.env["ANTHROPIC_OAUTH_TOKEN"]
	if (oauthEnv) return { mode: "oauth", token: oauthEnv }

	// 2. Token saved by login.ts
	const stored = readStoredToken()
	if (stored) return { mode: "oauth", token: stored }

	// 3. Traditional API key
	const apiKey = process.env["ANTHROPIC_API_KEY"]
	if (apiKey) return { mode: "api-key", token: apiKey }

	return null
}

// ---------------------------------------------------------------------------
// Client construction
// ---------------------------------------------------------------------------

/**
 * Build an Anthropic SDK client for the resolved auth mode.
 *
 * OAuth tokens require:
 *   - authToken instead of apiKey (sent as "Authorization: Bearer <token>")
 *   - anthropic-beta: "claude-code-20250219,oauth-2025-04-20"
 *   - user-agent / x-app headers that identify this as a Claude Code client
 *
 * Without the "claude-code-20250219" beta header the API rejects OAuth tokens.
 */
export function createAnthropicClient(auth: AuthResult): Anthropic {
	if (auth.mode === "oauth") {
		return new Anthropic({
			apiKey: "placeholder", // SDK requires a non-empty string even when unused
			authToken: auth.token,
			baseURL: "https://api.anthropic.com",
			defaultHeaders: {
				"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
				"user-agent": "claude-cli/2.0.0",
				"x-app": "cli",
			},
		})
	}

	return new Anthropic({ apiKey: auth.token })
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Resolve credentials, build the right client, and return a provider.
 * Throws with a clear message if no credentials are found.
 */
export function createAnthropicProvider(model = "claude-haiku-4-5-20251001"): Provider {
	const auth = resolveAuth()
	if (!auth) {
		throw new Error(
			"No Anthropic credentials found.\n" +
				"Options:\n" +
				"  1. Run `npx tsx src/login.ts` to log in with your Claude Pro/Max subscription\n" +
				"  2. Set ANTHROPIC_OAUTH_TOKEN=<your-token> in your environment\n" +
				"  3. Set ANTHROPIC_API_KEY=<your-key> in your environment\n",
		)
	}

	const client = createAnthropicClient(auth)
	console.log(`[auth] Using ${auth.mode} credentials`)
	return new AnthropicProvider(model, client)
}

// ---------------------------------------------------------------------------
// Demo — run with: npx tsx src/auth.ts
// ---------------------------------------------------------------------------

if (import.meta.url === `file://${process.argv[1]}`) {
	;(async () => {
		const { stream } = await import("./ai.js")

		const provider = createAnthropicProvider()
		console.log("Streaming response:\n")

		const s = await stream(provider, {
			messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
		})

		for await (const event of s) {
			if (event.type === "text") process.stdout.write(event.content)
			if (event.type === "done") {
				console.log("\n\nDone!")
				console.log(`Tokens: ${event.message.usage.inputTokens} in / ${event.message.usage.outputTokens} out`)
			}
		}
	})().catch(console.error)
}
