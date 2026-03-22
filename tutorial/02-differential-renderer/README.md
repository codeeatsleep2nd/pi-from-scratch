# Chapter 02 — Differential Renderer

## Goal

Only redraw the lines that actually changed. Rewriting every line on every frame causes flicker and is slow when the output is large. Differential rendering compares the previous frame with the new one and only writes the region that differs.

## The key insight

```
Previous frame:        New frame:           What to redraw:
  Line 0: "Hello"        "Hello"             (unchanged)
  Line 1: "World"        "World!"   ←        (changed — write this)
  Line 2: "---"          "---"               (unchanged)
```

Instead of redrawing all 3 lines, find `firstChanged=1` and `lastChanged=1`, move to line 1, and rewrite only that one line.

## Algorithm

```
1. Compare prev[i] with next[i] to find firstChanged and lastChanged
2. Move cursor from cursorLine to firstChanged:
     - if firstChanged < cursorLine: move up (cursorLine - firstChanged) lines
     - if firstChanged > cursorLine: move down (firstChanged - cursorLine) lines
3. For each line from firstChanged to lastChanged:
   a. Clear the line
   b. Write the new content
4. Record cursorLine = lastChanged
5. If new frame has fewer lines than old, clear the extra lines at the bottom,
   then update cursorLine = next.length - 1
6. Store next as prev for the next render
```

The key invariant is **cursorLine**: after every render, we know exactly which line the cursor is on. The next render uses this to compute the precise up/down movement to reach `firstChanged`. Without tracking this, the code can only assume the cursor is at the bottom of the frame — which is wrong whenever only a middle line was updated.

## Edge cases

- **First render**: No previous frame, write everything from scratch
- **Frame is identical**: Nothing to write (firstChanged = -1)
- **New frame is shorter**: Must erase trailing lines from the old frame
- **New frame is taller**: Must write additional lines below the previous bottom

## Why not just `console.clear()`?

`console.clear()` (`\x1b[2J`) flashes the entire terminal, loses scrollback, and requires redrawing from row 0. Differential rendering is invisible to the user — only changed regions flicker.

## Files for this chapter

Create the following files in your `pi-from-scratch/` project:

| File | What to do |
|------|-----------|
| `src/renderer.ts` | Create — copy from [`src/renderer.ts`](./src/renderer.ts) |
| `test/renderer.test.ts` | Create — copy from [`test/renderer.test.ts`](./test/renderer.test.ts) |

## The code

`src/renderer.ts` contains:
- `DifferentialRenderer` class
- `render(lines: string[])` method
- Uses the ANSI helpers from chapter 01

## How to run the demo

```bash
# Run from pi-from-scratch/
npx tsx src/renderer.ts
```

The demo shows a list of 5 items (`Apple`, `Banana`, `Cherry`, `Date`, `Elderberry`) with one highlighted in green:

```
Differential Renderer Demo
Frame: 1 — only changed lines redraw

  Apple
▶ Banana       ← currently selected item (green)
  Cherry
  Date
  Elderberry

↑/↓ arrows to move, Ctrl+C to quit
```

**Controls:**
- `↑` / `↓` arrow keys — move the selection up and down
- `Ctrl+C` — exit

**Expected behaviour:**

- When you press `↑` or `↓`, only the two lines that change (the previously selected item losing its `▶` marker, and the newly selected item gaining it) flicker briefly. All other lines stay completely still.
- The frame counter in the second line increments on every redraw (~20 fps), but since that line changes every frame you will see it updating continuously — this is intentional, to show that the renderer is running.
- If you do nothing, only the frame counter line redraws on each tick. The item list is completely static because nothing changed.

This is the key proof that differential rendering works: move the selection and watch only 2 lines update, not all 8.

## Debugging tips

- **Ghost lines appear after pressing a key**: Classic symptom of incorrect cursor tracking. The renderer moved the cursor to the wrong line and wrote content on top of previously rendered lines. Add a debug log of `cursorLine`, `firstChanged`, and `lastChanged` on every frame to spot where tracking goes wrong.
- **Off-by-one errors**: The most common cursor bug. Draw the frame on paper, mark where the cursor is before and after each operation, and step through manually.
- **Extra blank lines appear at the bottom**: Forgetting to clear lines when the new frame is shorter than the old one.
- **Add a debug mode**: Write to a log file (not stdout) so diagnostic output doesn't corrupt the render.

```typescript
// Debug: log to a file, not stdout — writing to stdout would corrupt the render
import { appendFileSync } from "fs"
function debugLog(msg: string) {
  appendFileSync("/tmp/tui-debug.log", msg + "\n")
}

// In render(), add:
debugLog(`frame: cursorLine=${this.cursorLine} firstChanged=${firstChanged} lastChanged=${lastChanged}`)
```

## Tests

Run from `pi-from-scratch/`:
```bash
npx vitest --run test/renderer.test.ts
```

Tests capture ANSI output as a string and verify:
- Only changed lines are rewritten
- Unchanged frames produce no output
- Shrinking frames erase trailing lines
- Cursor moves **down** (not up) when `firstChanged` is below `cursorLine` — the exact scenario that caused the ghost-line bug

---

Next: [Chapter 03 — Key Input Parsing](../03-key-input/README.md)
