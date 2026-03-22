# Chapter 09 — Session Persistence

## Goal

Save and load conversations to disk so sessions survive process restarts. A session is a JSON file containing a header (metadata) and an array of messages.

## Why persistence matters

Without persistence, every restart loses context. With it:
- Resume a long coding session after a break
- Branch a session to explore alternative approaches
- Share sessions between machines
- Export sessions as readable logs

## Session format

The JSON format maps directly to the `Session` interface in `src/session.ts`:

```typescript
export interface Session {
  version: number           // always 1 — for future migrations
  header: SessionHeader     // id, created, updated, name, model
  messages: ConversationMessage[]
}
```

Example file on disk:

```json
{
  "version": 1,
  "header": {
    "id": "abc123",
    "created": 1700000000000,
    "name": "Fix the auth bug",
    "model": "claude-haiku-4-5-20251001"
  },
  "messages": [
    { "role": "user", "content": "Help me fix the login bug", "timestamp": 1700000001000 },
    {
      "role": "assistant",
      "content": "Let me look at the auth code...",
      "toolCalls": [],
      "usage": { "inputTokens": 150, "outputTokens": 80 },
      "stopReason": "stop",
      "timestamp": 1700000005000
    }
  ]
}
```

`messages` is a plain array — no indexing, no compression. `JSON.stringify(session, null, 2)` writes indented JSON so you can inspect any session file in a text editor.

When loading, `validateSession()` checks that `version`, `header.id`, `header.created`, and `messages` are present and have the right types. If the file is corrupt it throws rather than returning a broken object. `listSessions()` silently skips corrupted files so one bad file doesn't prevent listing the rest.

## Branching

Branching creates a snapshot of the session at a specific point. Like `git branch`:
- `branchSession(session, "try-approach-2")` — copies current messages to a branch file
- `loadBranch(id, "try-approach-2")` — loads the snapshot back
- Branches are separate JSON files with a name suffix in the same directory

```
~/.local/share/pi-from-scratch/sessions/
  abc123.json                            ← main session
  abc123.branch-try-approach-2.json      ← branch
```

The file naming convention is defined by `branchPath()`:

```typescript
private branchPath(sessionId: string, branchName: string): string {
  return join(this.sessionsDir, `${sessionId}.branch-${branchName}.json`)
}
```

`listSessions()` filters branches out with `.filter(f => !f.includes(".branch-"))`. `listBranches()` finds them with `.filter(f => f.startsWith(prefix))`.

Inside `branchSession`, messages are shallow-copied (`[...session.messages]`) so the snapshot is independent from the moment it's created. Because messages are only ever appended (never mutated in place), a shallow copy is safe.

## Auto-save

After each agent turn, the session manager writes the updated messages to disk. Since JSON serialization is fast, this adds minimal latency.

`appendMessage()` is the auto-save hook — it pushes the message onto the array then immediately calls `saveSession()`:

```typescript
async appendMessage(session: Session, message: ConversationMessage): Promise<void> {
  session.messages.push(message)
  await this.saveSession(session)   // ← always saves after appending
}
```

`saveSession()` also mutates `session.header.updated = Date.now()` before writing, so the in-memory object and the file stay in sync without a separate reload.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/session.ts` | Create — copy from [`src/session.ts`](./src/session.ts) |
| `test/session.test.ts` | Create — copy from [`test/session.test.ts`](./test/session.test.ts) |

## The code

`src/session.ts` contains:
- `SessionManager` class
- `createSession()`, `loadSession()`, `saveSession()`
- `branchSession()`, `loadBranch()`, `listBranches()`

## No demo to run

`session.ts` is a storage library. It reads and writes JSON files but has no standalone behaviour — nothing happens when you run it directly. It is called by the interactive mode in chapter 10, which creates a session on startup, appends messages after each agent turn, and offers branch/resume commands.

The interesting behaviour only appears when session data flows in from the agent loop and back out to the UI.

## What the tests verify

All tests use the same temporary directory pattern as chapter 08:

```typescript
let tmpDir: string
let manager: SessionManager

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "pi-session-test-"))
  manager = new SessionManager(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})
```

`SessionManager` takes a directory path as a constructor argument, so tests can point it at a fresh temp directory instead of `~/.local/share/pi-from-scratch/sessions/`. Every test gets an empty directory and leaves nothing behind.

### Test breakdown

**`createSession`**

| Test | What it does |
|------|-------------|
| creates a session with a generated ID | ID is a 12-character hex string (6 random bytes) |
| uses provided name | `{ name: "My Test Session" }` option is stored in the header |
| creates session with empty messages | new sessions start with zero messages |
| persists the session to disk | creates, then loads back, confirming it was written to disk |

**`loadSession`**

| Test | What it does |
|------|-------------|
| loads a previously saved session | round-trip: create → load → check ID and name match |
| throws for non-existent session | `loadSession("nonexistent")` rejects with "not found" |

**`saveSession`**

| Test | What it does |
|------|-------------|
| updates the 'updated' timestamp | saves twice with a 10ms gap; second save has a later timestamp |
| persists messages | pushes a message onto `session.messages`, saves, reloads, confirms message is there |

**`appendMessage`**

| Test | What it does |
|------|-------------|
| appends a message and saves | `appendMessage()` adds to the array and auto-saves; reload confirms it |
| appends multiple messages in order | three sequential appends produce three messages in the same order |

**`listSessions`**

| Test | What it does |
|------|-------------|
| returns empty array when no sessions exist | fresh directory → empty list |
| lists all sessions sorted by most recently updated | creates two sessions 10ms apart; most recently updated comes first |
| includes message count | saves a session with 2 messages; `listSessions()` returns `messageCount: 2` |

**`branching`**

| Test | What it does |
|------|-------------|
| creates a branch from current state | branch inherits current messages at the time of branching |
| branch is independent — changes to main don't affect it | adds a message to main after branching; loading the branch shows the original (shorter) state |
| lists branches for a session | creates two branches; `listBranches()` returns both names |
| throws when loading non-existent branch | `loadBranch(..., "nonexistent")` rejects with "not found" |

**`renameSession` / `deleteSession`**

| Test | What it does |
|------|-------------|
| renames a session | `renameSession()` updates the name; reload confirms it |
| deletes a session | after delete, `loadSession()` rejects with "not found" |
| throws when deleting non-existent session | `deleteSession("nonexistent")` rejects with "not found" |

The branching independence test is the most important — it proves that a branch is a snapshot, not a live view. Modifying the main session after branching must not change what the branch returns.

## Debugging tips

- **Corrupted session file**: Always validate JSON on load. If corrupt, try to load a backup (keep one backup of the last good state).
- **Race conditions**: If the user runs two instances, they may both write to the same file. Use a lock file or last-write-wins (simpler).
- **Large sessions**: After 100+ messages, the file can be several MB. Use `JSON.stringify` lazily and avoid parsing the whole file to get just the header.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/session.test.ts
```

---

Next: [Chapter 10 — Interactive Mode](../10-interactive-mode/README.md)
