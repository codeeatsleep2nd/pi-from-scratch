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

## Branching

Branching creates a copy of the session at a specific point. Like `git branch`:
- `branch("try-approach-2")` — saves the current messages to a branch file
- `switchBranch("try-approach-2")` — loads the branch into the active session
- Branches are just separate JSON files with a name prefix

```
~/.local/share/pi-from-scratch/sessions/
  abc123.json                            ← main session
  abc123.branch-try-approach-2.json      ← branch
```

## Auto-save

After each agent turn, the session manager writes the updated messages to disk. Since JSON serialization is fast, this adds minimal latency.

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
