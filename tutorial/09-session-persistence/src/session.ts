/**
 * Step 09 — Session Persistence
 *
 * Save and load conversations from disk.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from "fs/promises"
import { join, dirname } from "path"
import { randomBytes } from "crypto"
import type { ConversationMessage } from "./agent-loop.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionHeader {
	id: string
	created: number // Unix ms
	updated: number // Unix ms
	name: string
	model?: string
}

export interface Session {
	version: number
	header: SessionHeader
	messages: ConversationMessage[]
}

export interface SessionSummary {
	id: string
	name: string
	created: Date
	updated: Date
	messageCount: number
	model?: string
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

export class SessionManager {
	constructor(private readonly sessionsDir: string) {}

	private sessionPath(id: string): string {
		return join(this.sessionsDir, `${id}.json`)
	}

	private branchPath(sessionId: string, branchName: string): string {
		return join(this.sessionsDir, `${sessionId}.branch-${branchName}.json`)
	}

	/** Ensure the sessions directory exists */
	private async ensureDir(): Promise<void> {
		await mkdir(this.sessionsDir, { recursive: true })
	}

	// -------------------------------------------------------------------------
	// Create / Load / Save
	// -------------------------------------------------------------------------

	/**
	 * Create a new empty session and persist it.
	 */
	async createSession(options: { name?: string; model?: string } = {}): Promise<Session> {
		await this.ensureDir()

		const id = randomBytes(6).toString("hex")
		const now = Date.now()
		const session: Session = {
			version: 1,
			header: {
				id,
				created: now,
				updated: now,
				name: options.name ?? `Session ${new Date(now).toLocaleString()}`,
				model: options.model,
			},
			messages: [],
		}

		await this.saveSession(session)
		return session
	}

	/**
	 * Load a session from disk by ID.
	 */
	async loadSession(id: string): Promise<Session> {
		const path = this.sessionPath(id)
		let raw: string
		try {
			raw = await readFile(path, "utf8")
		} catch {
			throw new Error(`Session not found: ${id}`)
		}

		try {
			const data = JSON.parse(raw)
			return validateSession(data)
		} catch (err) {
			throw new Error(`Corrupted session file ${path}: ${err instanceof Error ? err.message : String(err)}`)
		}
	}

	/**
	 * Save a session to disk.
	 * Updates the `updated` timestamp automatically.
	 */
	async saveSession(session: Session): Promise<void> {
		await this.ensureDir()
		session.header.updated = Date.now()
		const path = this.sessionPath(session.header.id)
		await writeFile(path, JSON.stringify(session, null, 2), "utf8")
	}

	/**
	 * Append a message to a session and save.
	 */
	async appendMessage(session: Session, message: ConversationMessage): Promise<void> {
		session.messages.push(message)
		await this.saveSession(session)
	}

	// -------------------------------------------------------------------------
	// List sessions
	// -------------------------------------------------------------------------

	/**
	 * List all sessions (sorted by most recently updated).
	 */
	async listSessions(): Promise<SessionSummary[]> {
		await this.ensureDir()

		let files: string[]
		try {
			files = await readdir(this.sessionsDir)
		} catch {
			return []
		}

		const sessionFiles = files.filter((f) => f.endsWith(".json") && !f.includes(".branch-"))

		const summaries: SessionSummary[] = []
		for (const file of sessionFiles) {
			try {
				const raw = await readFile(join(this.sessionsDir, file), "utf8")
				const data = JSON.parse(raw) as Session
				summaries.push({
					id: data.header.id,
					name: data.header.name,
					created: new Date(data.header.created),
					updated: new Date(data.header.updated),
					messageCount: data.messages.length,
					model: data.header.model,
				})
			} catch {
				// Skip corrupted files
			}
		}

		return summaries.sort((a, b) => b.updated.getTime() - a.updated.getTime())
	}

	// -------------------------------------------------------------------------
	// Branching
	// -------------------------------------------------------------------------

	/**
	 * Create a named branch from the current session state.
	 * The branch is a snapshot — changes to the main session don't affect it.
	 */
	async branchSession(session: Session, branchName: string): Promise<Session> {
		const branch: Session = {
			version: session.version,
			header: {
				...session.header,
				id: session.header.id,
				name: `${session.header.name} [${branchName}]`,
			},
			messages: [...session.messages],
		}

		const path = this.branchPath(session.header.id, branchName)
		await writeFile(path, JSON.stringify(branch, null, 2), "utf8")
		return branch
	}

	/**
	 * Load a named branch for a session.
	 */
	async loadBranch(sessionId: string, branchName: string): Promise<Session> {
		const path = this.branchPath(sessionId, branchName)
		try {
			const raw = await readFile(path, "utf8")
			return validateSession(JSON.parse(raw))
		} catch {
			throw new Error(`Branch not found: ${branchName} for session ${sessionId}`)
		}
	}

	/**
	 * List all branches for a session.
	 */
	async listBranches(sessionId: string): Promise<string[]> {
		await this.ensureDir()
		let files: string[]
		try {
			files = await readdir(this.sessionsDir)
		} catch {
			return []
		}

		const prefix = `${sessionId}.branch-`
		return files
			.filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
			.map((f) => f.slice(prefix.length, -5)) // extract branch name
	}

	// -------------------------------------------------------------------------
	// Rename / Delete
	// -------------------------------------------------------------------------

	async renameSession(session: Session, newName: string): Promise<void> {
		session.header.name = newName
		await this.saveSession(session)
	}

	async deleteSession(id: string): Promise<void> {
		try {
			await unlink(this.sessionPath(id))
		} catch {
			throw new Error(`Session not found: ${id}`)
		}
	}
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateSession(data: unknown): Session {
	if (typeof data !== "object" || data === null) {
		throw new Error("Session data is not an object")
	}

	const d = data as Record<string, unknown>

	if (typeof d["version"] !== "number") {
		throw new Error("Missing or invalid 'version' field")
	}

	if (typeof d["header"] !== "object" || d["header"] === null) {
		throw new Error("Missing or invalid 'header' field")
	}

	const header = d["header"] as Record<string, unknown>
	if (typeof header["id"] !== "string" || typeof header["created"] !== "number") {
		throw new Error("Invalid session header")
	}

	if (!Array.isArray(d["messages"])) {
		throw new Error("Missing or invalid 'messages' field")
	}

	return data as Session
}
