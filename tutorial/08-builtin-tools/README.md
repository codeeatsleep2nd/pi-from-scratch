# Chapter 08 — Built-in Tools

## Goal

Implement the four core tools that make a coding agent useful: `read`, `write`, `bash`, and `edit`. These are what `pi` uses to read and modify code.

## The tools

### `read` — Read a file

Reads a file and returns its contents. Key considerations:
- **Truncation**: Large files must be truncated (100KB or 3000 lines). Return a summary of what was cut.
- **Images**: Detect image files by extension/magic bytes and return them as base64 for multimodal LLMs.
- **Offset/limit**: Allow reading a slice of a file (for large files where you know the relevant section).
- **Binary files**: Return an error, not garbled text.

### `write` — Write a file

Write the entire contents of a file. Used for creating new files or complete rewrites. Always creates parent directories if needed.

### `bash` — Execute a shell command

Runs a shell command and returns stdout + stderr. Key considerations:
- **Timeout**: Always set a timeout (default 30s) to prevent hanging.
- **Working directory**: Run in the project's working directory.
- **Environment**: Inherit env vars but optionally restrict dangerous ones.
- **Large output**: Truncate stdout/stderr if too large (10KB limit is common).

### `edit` — Edit a file (replace text)

Find an exact string in a file and replace it. This is more reliable than full rewrites because:
- The LLM only needs to specify what changes, not the whole file
- Avoids accidentally changing unrelated code
- The diff is small and checkable

If the search string is not found, return a clear error. The LLM can retry with better context.

## Error handling philosophy

Tools should **never throw** — they should return `{ isError: true, content: "..." }`. This lets the LLM see the error and potentially recover. Common recoverable errors:
- File not found → LLM can try a different path
- Permission denied → LLM can explain the issue to the user
- Search string not found in edit → LLM can re-read the file and try again

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/tools/read.ts` | Create — copy from [`src/tools/read.ts`](./src/tools/read.ts) |
| `src/tools/write.ts` | Create — copy from [`src/tools/write.ts`](./src/tools/write.ts) |
| `src/tools/bash.ts` | Create — copy from [`src/tools/bash.ts`](./src/tools/bash.ts) |
| `src/tools/edit.ts` | Create — copy from [`src/tools/edit.ts`](./src/tools/edit.ts) |
| `test/builtin-tools.test.ts` | Create — copy from [`test/builtin-tools.test.ts`](./test/builtin-tools.test.ts) |

Note: `src/tools/` is a new subdirectory — create it before adding the tool files.

## No demo to run

These four tools are called by the agent loop, not by the user directly. Running `bash.ts` would just exit silently because there is no top-level code. The interesting behaviour only appears when an LLM decides to call a tool — which happens in chapter 10.

## The code

`src/tools/` contains four files, one per tool. Each exports a single `ToolDefinition` constant and has no dependencies on other chapters except for the `ToolDefinition` and `ToolResult` types from `src/tools.ts`.

## What the tests verify

Unlike chapters 06 and 07, these tests **touch the real filesystem and run real shell commands**. They use a temporary directory so nothing outside your project is affected.

### How the temporary directory works

At the top of the test file:

```typescript
let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "pi-tutorial-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})
```

Before each test, `mkdtemp` creates a fresh directory with a random suffix under your OS's temp folder (e.g. `/tmp/pi-tutorial-test-a3f9x2/`). After each test, `rm` deletes it entirely. Every test gets a clean slate and leaves no files behind.

To see where it lands while tests are running, add a `console.log(tmpDir)` inside `beforeEach`, then run the tests. You can then `ls` that path between tests to inspect the files the tools created.

### Test breakdown

**`readTool`**

| Test | What it does |
|------|-------------|
| reads a simple text file | writes a file with `fs.writeFile`, calls `readTool.execute`, checks content comes back |
| returns error for missing file | passes a path that doesn't exist, expects `{ isError: true }` |
| truncates files with more than 3000 lines | writes a 4000-line file, checks the result mentions `showing lines 1–3000` |
| respects offset and limit | writes 5 lines, reads lines 2–3, verifies lines 1 and 4 are absent |
| returns error for binary files | writes 4 ZIP magic bytes, expects `{ isError: true }` |
| returns metadata for image files | writes 4 PNG magic bytes, expects `{ isError: false }` with `Image file` in content |

**`writeTool`**

| Test | What it does |
|------|-------------|
| creates a new file | calls `writeTool.execute`, checks the success message |
| overwrites an existing file | writes "Old content", overwrites with "New content", reads back to confirm |
| creates parent directories | passes `nested/deep/file.txt`, verifies directories are created automatically |
| reports file size in result | writes 1024 bytes, checks the result mentions KB or bytes |

**`editTool`**

| Test | What it does |
|------|-------------|
| replaces an exact string | writes a 3-line file, replaces one line, reads back to confirm |
| returns error when string not found | search string not present → `{ isError: true }` |
| returns error when string appears multiple times | `"foo"` appears twice → `{ isError: true }` with count in message |
| returns error when file does not exist | missing file → `{ isError: true }` |
| handles multi-line replacements | `oldString` spans 3 lines including a function body |

**`bashTool`**

| Test | What it does |
|------|-------------|
| runs a simple command | `echo 'hello bash'` → output in content |
| captures stderr | `echo ... >&2; exit 1` → `{ isError: true }` with stderr in content |
| returns non-zero exit as error | `exit 42` → `{ isError: true }` with exit code in message |
| respects timeout | `sleep 10` with 200ms timeout → `{ isError: true }` with "timed out" |
| runs in specified working directory | `pwd` in a subdir → output contains subdir path |
| handles AbortSignal | abort the controller immediately after starting `sleep 10` → `{ isError: true }` |

The timeout and AbortSignal tests have an explicit `5000` ms vitest timeout so the test runner itself doesn't hang if the implementation is broken.

## Debugging tips

- **Edit tool fails "not found"**: Add a debug mode that prints the first 100 chars of both the search string and the file to check for whitespace/encoding differences.
- **Bash hangs**: Always pass `timeout` to subprocess execution. Use `AbortSignal` to kill the process when the user aborts.
- **Large file read**: Test with files > 100KB. The truncation logic is easy to get wrong.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/builtin-tools.test.ts
```

Tests use a temporary directory so they don't modify real files.

---

Next: [Chapter 09 — Session Persistence](../09-session-persistence/README.md)
