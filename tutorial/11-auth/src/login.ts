/**
 * Chapter 11 — Anthropic OAuth login
 *
 * Run this once to authenticate with your Claude Pro/Max subscription.
 * It performs the OAuth PKCE flow, then saves tokens to
 * ~/.config/pi-from-scratch/auth.json.
 *
 * Usage:
 *   npx tsx src/login.ts
 */

import { createServer } from "node:http"
import { createHash, randomBytes } from "node:crypto"
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

// ---------------------------------------------------------------------------
// OAuth constants (Anthropic's public OAuth endpoints)
// ---------------------------------------------------------------------------

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token"
const CALLBACK_PORT = 54321
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`
const SCOPES = "org:create_api_key user:profile user:inference"

// Where to save the token on disk
export const AUTH_FILE = join(homedir(), ".config", "pi-from-scratch", "auth.json")

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
	return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function generatePKCE(): { verifier: string; challenge: string } {
	const verifier = base64url(randomBytes(32))
	const challenge = base64url(createHash("sha256").update(verifier).digest())
	return { verifier, challenge }
}

// ---------------------------------------------------------------------------
// Local callback server
// ---------------------------------------------------------------------------

function waitForCallback(expectedState: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			const url = new URL(req.url ?? "", "http://localhost")
			if (url.pathname !== "/callback") {
				res.writeHead(404)
				res.end("Not found")
				return
			}

			const code = url.searchParams.get("code")
			const state = url.searchParams.get("state")
			const error = url.searchParams.get("error")

			if (error) {
				res.writeHead(400)
				res.end(`OAuth error: ${error}`)
				server.close()
				reject(new Error(`OAuth error: ${error}`))
				return
			}

			if (!code || state !== expectedState) {
				res.writeHead(400)
				res.end("Missing code or state mismatch")
				server.close()
				reject(new Error("Missing code or state mismatch"))
				return
			}

			res.writeHead(200, { "Content-Type": "text/html" })
			res.end("<h1>Login successful — you can close this tab.</h1>")
			server.close()
			resolve(code)
		})

		server.listen(CALLBACK_PORT, "127.0.0.1", () => {
			console.log(`Waiting for OAuth callback on port ${CALLBACK_PORT}...`)
		})

		server.on("error", reject)
	})
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
	access_token: string
	refresh_token: string
	expires_in: number
}

async function exchangeCode(code: string, verifier: string): Promise<TokenResponse> {
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			code,
			redirect_uri: REDIRECT_URI,
			code_verifier: verifier,
		}),
	})

	if (!res.ok) {
		const body = await res.text()
		throw new Error(`Token exchange failed (${res.status}): ${body}`)
	}

	return res.json() as Promise<TokenResponse>
}

// ---------------------------------------------------------------------------
// Save credentials
// ---------------------------------------------------------------------------

export interface StoredCredentials {
	access: string
	refresh: string
	expires: number // Unix ms
}

function saveCredentials(creds: StoredCredentials): void {
	mkdirSync(join(homedir(), ".config", "pi-from-scratch"), { recursive: true })
	writeFileSync(AUTH_FILE, JSON.stringify(creds, null, 2))
	console.log(`Credentials saved to ${AUTH_FILE}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

;(async () => {
	const { verifier, challenge } = generatePKCE()

	const params = new URLSearchParams({
		code: "true",
		client_id: CLIENT_ID,
		response_type: "code",
		redirect_uri: REDIRECT_URI,
		scope: SCOPES,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state: verifier,
	})

	const authUrl = `${AUTHORIZE_URL}?${params}`

	// Try to open the browser automatically, fall back to printing the URL
	console.log("\nOpening browser for Anthropic login...")
	console.log("If the browser does not open, visit this URL manually:\n")
	console.log(authUrl + "\n")

	try {
		const { exec } = await import("node:child_process")
		const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
		exec(`${open} "${authUrl}"`)
	} catch {
		// ignore — user can open manually
	}

	const code = await waitForCallback(verifier)

	console.log("Exchanging code for tokens...")
	const tokens = await exchangeCode(code, verifier)

	const creds: StoredCredentials = {
		access: tokens.access_token,
		refresh: tokens.refresh_token,
		expires: Date.now() + tokens.expires_in * 1000 - 5 * 60 * 1000,
	}

	saveCredentials(creds)
	console.log("\nLogin successful! Run your agent — it will pick up the token automatically.")
})().catch((err) => {
	console.error("Login failed:", err.message)
	process.exit(1)
})
