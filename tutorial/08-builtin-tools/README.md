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

## The code

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
