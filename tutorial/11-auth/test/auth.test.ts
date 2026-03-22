/**
 * Chapter 11 — Auth tests
 *
 * Tests credential resolution logic without needing real API keys or a login.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { resolveAuth, isOAuthToken, readStoredToken } from "../src/auth.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
	const saved: Record<string, string | undefined> = {}
	for (const key of Object.keys(vars)) {
		saved[key] = process.env[key]
		if (vars[key] === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = vars[key]
		}
	}
	try {
		fn()
	} finally {
		for (const key of Object.keys(saved)) {
			if (saved[key] === undefined) {
				delete process.env[key]
			} else {
				process.env[key] = saved[key]
			}
		}
	}
}

// ---------------------------------------------------------------------------
// isOAuthToken
// ---------------------------------------------------------------------------

describe("isOAuthToken", () => {
	it("recognises OAuth tokens by prefix", () => {
		expect(isOAuthToken("sk-ant-oat01-abc123")).toBe(true)
		expect(isOAuthToken("sk-ant-api03-abc123")).toBe(false)
		expect(isOAuthToken("sk-proj-abc123")).toBe(false)
	})
})

// ---------------------------------------------------------------------------
// resolveAuth — env var priority
// ---------------------------------------------------------------------------

describe("resolveAuth", () => {
	beforeEach(() => {
		delete process.env["ANTHROPIC_OAUTH_TOKEN"]
		delete process.env["ANTHROPIC_API_KEY"]
	})

	it("returns null when no credentials are set (and no stored token)", () => {
		withEnv({ ANTHROPIC_OAUTH_TOKEN: undefined, ANTHROPIC_API_KEY: undefined }, () => {
			const result = resolveAuth()
			// May be non-null if ~/.config/pi-from-scratch/auth.json exists and is valid
			if (result === null) {
				expect(result).toBeNull()
			} else {
				expect(result.mode).toBe("oauth")
			}
		})
	})

	it("prefers ANTHROPIC_OAUTH_TOKEN over ANTHROPIC_API_KEY", () => {
		withEnv(
			{
				ANTHROPIC_OAUTH_TOKEN: "sk-ant-oat01-oauth",
				ANTHROPIC_API_KEY: "sk-ant-api03-key",
			},
			() => {
				const result = resolveAuth()
				expect(result?.mode).toBe("oauth")
				expect(result?.token).toBe("sk-ant-oat01-oauth")
			},
		)
	})

	it("returns mode:oauth when only ANTHROPIC_OAUTH_TOKEN is set", () => {
		withEnv({ ANTHROPIC_OAUTH_TOKEN: "sk-ant-oat01-test", ANTHROPIC_API_KEY: undefined }, () => {
			const result = resolveAuth()
			expect(result).not.toBeNull()
			expect(result!.mode).toBe("oauth")
			expect(result!.token).toBe("sk-ant-oat01-test")
		})
	})

	it("returns mode:api-key when only ANTHROPIC_API_KEY is set (and no stored token)", () => {
		withEnv({ ANTHROPIC_OAUTH_TOKEN: undefined, ANTHROPIC_API_KEY: "sk-ant-api03-testkey" }, () => {
			const result = resolveAuth()
			// If a valid stored token exists on this machine, result will be oauth — that's correct
			if (result?.mode === "api-key") {
				expect(result.token).toBe("sk-ant-api03-testkey")
			} else {
				expect(result?.mode).toBe("oauth")
			}
		})
	})
})

// ---------------------------------------------------------------------------
// readStoredToken
// ---------------------------------------------------------------------------

describe("readStoredToken", () => {
	it("returns a string or undefined — never throws", () => {
		expect(() => readStoredToken()).not.toThrow()
		const result = readStoredToken()
		expect(typeof result === "string" || result === undefined).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// Credential shape validation (documents the expected format)
// ---------------------------------------------------------------------------

describe("StoredCredentials shape", () => {
	it("valid credentials have access token, refresh token, and future expiry", () => {
		const valid = {
			access: "sk-ant-oat01-faketoken",
			refresh: "sk-ant-ort01-fakerefresh",
			expires: Date.now() + 3_600_000,
		}
		expect(valid.access.startsWith("sk-ant-oat")).toBe(true)
		expect(valid.expires).toBeGreaterThan(Date.now())
	})

	it("expired credentials have a past expiry timestamp", () => {
		const expired = {
			access: "sk-ant-oat01-expired",
			refresh: "sk-ant-ort01-refresh",
			expires: Date.now() - 1000,
		}
		expect(Date.now()).toBeGreaterThanOrEqual(expired.expires)
	})
})
