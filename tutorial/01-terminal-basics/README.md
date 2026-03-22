# Chapter 01 — Terminal Basics

## Goal

Understand how to write directly to a terminal: raw mode, ANSI escape sequences, cursor control, and clearing lines. This is the foundation every TUI is built on.

## Concepts

### Normal mode vs. raw mode

In **normal (cooked) mode**, the OS line-buffers input and handles Backspace/Ctrl+C before your program sees anything.

In **raw mode**, every keypress is sent to your program immediately — including Escape, arrow keys, and Ctrl+C. Your program must handle all of that itself. This is how every terminal app (vim, htop, etc.) works.

```
Normal mode:   [user types "hello\n"] → program gets "hello\n" at once
Raw mode:      [user presses 'h']    → program gets 'h' immediately
               [user presses 'i']    → program gets 'i' immediately
               ...
```

### ANSI escape sequences

ANSI escape sequences are special byte sequences that control the terminal: move the cursor, change color, clear lines. They start with `ESC` (byte `0x1b`, `\x1b`, or `\e`) followed by `[` and a command.

Common ones used in this project:

| Sequence | Meaning |
|----------|---------|
| `\x1b[2K` | Clear entire current line |
| `\x1b[1A` | Move cursor up 1 line |
| `\x1b[{n}A` | Move cursor up n lines |
| `\x1b[0G` | Move cursor to column 0 (start of line) |
| `\x1b[?25l` | Hide cursor |
| `\x1b[?25h` | Show cursor |
| `\x1b[?2026h` | Enable synchronized output (prevents flicker) |
| `\x1b[?2026l` | Disable synchronized output |
| `\x1b[{n}m` | Set color/style (0=reset, 1=bold, 31=red, ...) |

### Synchronized output

When you re-render many lines, the user briefly sees partial renders (flicker). Synchronized output (`\x1b[?2026h` ... `\x1b[?2026l`) tells the terminal to buffer everything in between and paint it atomically.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/terminal.ts` | Create — copy from [`src/terminal.ts`](./src/terminal.ts) |
| `test/terminal.test.ts` | Create — copy from [`test/terminal.test.ts`](./test/terminal.test.ts) |

## The code

`src/terminal.ts` provides a minimal terminal abstraction:
- `enableRawMode()` / `disableRawMode()`
- `write(text)` — write to stdout
- `clearLine()` / `moveCursorUp(n)` / `hideCursor()` / `showCursor()`
- A simple "clear and redraw" loop for rendering multiple lines

## How to run the demo

```bash
# Run from pi-from-scratch/
npx tsx src/terminal.ts
# Draws a bouncing counter — press Ctrl+C to exit
```

## Debugging tips

- **Terminal state gets stuck**: If your process crashes while in raw mode, your terminal becomes unusable. Always restore normal mode in a `process.on("exit")` handler. Run `reset` or `stty sane` in your shell to recover.
- **ANSI codes not working**: On Windows you may need to enable VT processing. Test on macOS/Linux first.
- **Invisible output**: Check you're writing to the right FD. Use `process.stdout.write()`, not `console.log()` (which adds a newline).

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/terminal.test.ts
```

Tests verify ANSI code generation without touching a real terminal (no raw mode in tests).

---

Next: [Chapter 02 — Differential Renderer](../02-differential-renderer/README.md)
