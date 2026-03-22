/**
 * Step 09 — Session Persistence tests
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { SessionManager, type Session } from "../src/session.js"
import type { ConversationMessage } from "../src/agent-loop.js"

let tmpDir: string
let manager: SessionManager

beforeEach(async () => {
	tmpDir = await mkdtemp(join(tmpdir(), "pi-session-test-"))
	manager = new SessionManager(tmpDir)
})

afterEach(async () => {
	await rm(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Create / Load / Save
// ---------------------------------------------------------------------------

describe("SessionManager", () => {
	describe("createSession", () => {
		it("creates a session with a generated ID", async () => {
			const session = await manager.createSession()
			expect(session.header.id).toHaveLength(12) // 6 bytes hex
			expect(session.version).toBe(1)
		})

		it("uses provided name", async () => {
			const session = await manager.createSession({ name: "My Test Session" })
			expect(session.header.name).toBe("My Test Session")
		})

		it("creates session with empty messages", async () => {
			const session = await manager.createSession()
			expect(session.messages).toHaveLength(0)
		})

		it("persists the session to disk", async () => {
			const session = await manager.createSession({ name: "Persisted" })
			// Load it back to verify it was saved
			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.header.name).toBe("Persisted")
		})
	})

	describe("loadSession", () => {
		it("loads a previously saved session", async () => {
			const session = await manager.createSession({ name: "Load Test" })
			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.header.id).toBe(session.header.id)
			expect(loaded.header.name).toBe("Load Test")
		})

		it("throws for non-existent session", async () => {
			await expect(manager.loadSession("nonexistent")).rejects.toThrow("not found")
		})
	})

	describe("saveSession", () => {
		it("updates the 'updated' timestamp", async () => {
			const session = await manager.createSession()
			const originalUpdated = session.header.updated

			// Wait a tick to ensure time difference
			await new Promise((r) => setTimeout(r, 10))
			await manager.saveSession(session)

			expect(session.header.updated).toBeGreaterThan(originalUpdated)
		})

		it("persists messages", async () => {
			const session = await manager.createSession()
			session.messages.push({ role: "user", content: "Hello!" })
			await manager.saveSession(session)

			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.messages).toHaveLength(1)
			expect((loaded.messages[0] as any).content).toBe("Hello!")
		})
	})

	describe("appendMessage", () => {
		it("appends a message and saves", async () => {
			const session = await manager.createSession()
			const msg: ConversationMessage = { role: "user", content: "Test message" }

			await manager.appendMessage(session, msg)

			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.messages).toHaveLength(1)
		})

		it("appends multiple messages in order", async () => {
			const session = await manager.createSession()

			await manager.appendMessage(session, { role: "user", content: "First" })
			await manager.appendMessage(session, { role: "user", content: "Second" })
			await manager.appendMessage(session, { role: "user", content: "Third" })

			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.messages).toHaveLength(3)
			expect((loaded.messages[1] as any).content).toBe("Second")
		})
	})

	// -------------------------------------------------------------------------
	// List
	// -------------------------------------------------------------------------

	describe("listSessions", () => {
		it("returns empty array when no sessions exist", async () => {
			const sessions = await manager.listSessions()
			expect(sessions).toHaveLength(0)
		})

		it("lists all sessions sorted by most recently updated", async () => {
			const s1 = await manager.createSession({ name: "First" })
			await new Promise((r) => setTimeout(r, 10))
			const s2 = await manager.createSession({ name: "Second" })

			const sessions = await manager.listSessions()
			expect(sessions).toHaveLength(2)
			// Most recently updated first
			expect(sessions[0]?.name).toBe("Second")
			expect(sessions[1]?.name).toBe("First")
		})

		it("includes message count", async () => {
			const session = await manager.createSession({ name: "With messages" })
			session.messages.push({ role: "user", content: "Hi" })
			session.messages.push({ role: "user", content: "Bye" })
			await manager.saveSession(session)

			const sessions = await manager.listSessions()
			const found = sessions.find((s) => s.name === "With messages")
			expect(found?.messageCount).toBe(2)
		})
	})

	// -------------------------------------------------------------------------
	// Branching
	// -------------------------------------------------------------------------

	describe("branching", () => {
		it("creates a branch from current state", async () => {
			const session = await manager.createSession({ name: "Main" })
			session.messages.push({ role: "user", content: "Original message" })
			await manager.saveSession(session)

			const branch = await manager.branchSession(session, "experiment")
			expect(branch.messages).toHaveLength(1)
			expect((branch.messages[0] as any).content).toBe("Original message")
		})

		it("branch is independent — changes to main don't affect it", async () => {
			const session = await manager.createSession({ name: "Main" })
			await manager.branchSession(session, "snapshot")

			// Add messages to main after branching
			session.messages.push({ role: "user", content: "Added after branch" })
			await manager.saveSession(session)

			// Load the branch — should not have the new message
			const branch = await manager.loadBranch(session.header.id, "snapshot")
			expect(branch.messages).toHaveLength(0)
		})

		it("lists branches for a session", async () => {
			const session = await manager.createSession()
			await manager.branchSession(session, "approach-1")
			await manager.branchSession(session, "approach-2")

			const branches = await manager.listBranches(session.header.id)
			expect(branches).toContain("approach-1")
			expect(branches).toContain("approach-2")
		})

		it("throws when loading non-existent branch", async () => {
			const session = await manager.createSession()
			await expect(manager.loadBranch(session.header.id, "nonexistent")).rejects.toThrow("not found")
		})
	})

	// -------------------------------------------------------------------------
	// Rename / Delete
	// -------------------------------------------------------------------------

	describe("renameSession", () => {
		it("renames a session", async () => {
			const session = await manager.createSession({ name: "Old Name" })
			await manager.renameSession(session, "New Name")

			const loaded = await manager.loadSession(session.header.id)
			expect(loaded.header.name).toBe("New Name")
		})
	})

	describe("deleteSession", () => {
		it("deletes a session", async () => {
			const session = await manager.createSession()
			await manager.deleteSession(session.header.id)

			await expect(manager.loadSession(session.header.id)).rejects.toThrow("not found")
		})

		it("throws when deleting non-existent session", async () => {
			await expect(manager.deleteSession("nonexistent")).rejects.toThrow("not found")
		})
	})
})
