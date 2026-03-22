# Chapter 03 — Key Input Parsing

## Goal

Parse raw bytes from stdin into named key events. When the user presses a key in raw mode, the OS sends bytes — some simple (letter `a` → `0x61`), some complex escape sequences (arrow up → `\x1b[A`).

## The problem

In raw mode, stdin delivers byte sequences. Some examples:

| Key pressed | Bytes received |
|-------------|----------------|
| `a` | `0x61` |
| `Ctrl+C` | `0x03` |
| `Ctrl+A` | `0x01` |
| `Escape` | `0x1b` |
| `Arrow Up` | `0x1b 0x5b 0x41` = `\x1b[A` |
| `Arrow Down` | `\x1b[B` |
| `Arrow Right` | `\x1b[C` |
| `Arrow Left` | `\x1b[D` |
| `Backspace` | `0x7f` |
| `Delete` | `\x1b[3~` |
| `Home` | `\x1b[H` or `\x1b[1~` |
| `End` | `\x1b[F` or `\x1b[4~` |
| `Page Up` | `\x1b[5~` |
| `Page Down` | `\x1b[6~` |
| `F1` | `\x1bOP` |
| `Shift+Tab` | `\x1b[Z` |

## Kitty keyboard protocol

Modern terminals support the [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/) which encodes keys more consistently: `\x1b[keycode;modifier;eventtype u`. For example, Ctrl+C becomes `\x1b[99;5u`. The real project detects this protocol and falls back to legacy parsing if unavailable.

For the tutorial, we'll handle the most important legacy sequences first.

## Key representation

We represent keys as strings for simple matching:

```
"a"           → letter a
"ctrl+c"      → Ctrl+C
"arrow_up"    → Up arrow
"backspace"   → Backspace
"enter"       → Enter
"tab"         → Tab
"shift+tab"   → Shift+Tab
"escape"      → Escape alone
```

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/keys.ts` | Create — copy from [`src/keys.ts`](./src/keys.ts) |
| `test/keys.test.ts` | Create — copy from [`test/keys.test.ts`](./test/keys.test.ts) |

## The code

`src/keys.ts` contains:
- `parseKey(data: string): string` — maps raw bytes to a key name
- `matchesKey(data: string, ...keys: string[]): boolean` — check if input matches
- `isPrintable(data: string): boolean` — check if input is a printable character

## How to run the demo

```bash
# Run from pi-from-scratch/
npx tsx src/keys.ts
# Press keys and see what name they map to — Ctrl+C to quit
```

## Debugging tips

- **Unknown key sequences**: Print the raw bytes to a debug log to see what the terminal is sending.
  ```typescript
  console.error([...data].map(c => c.charCodeAt(0).toString(16)).join(" "))
  ```
- **Escape vs. escape sequence**: After pressing Escape alone, you get `0x1b`. But `\x1b[A` (arrow up) also starts with `0x1b`. In the real project, a small delay disambiguates them. For simplicity, match longer sequences first.
- **Batched input**: Terminals sometimes deliver multiple key presses in a single `data` event. The real `StdinBuffer` splits them. For the tutorial, we process one at a time.

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/keys.test.ts
```

---

Next: [Chapter 04 — Components](../04-components/README.md)
