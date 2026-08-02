# WMS Docs Export — Word & Visual Diagrams

Turns the project Markdown manuals into **Word (.docx)** and **HTML** with Mermaid diagrams rendered as **PNG images** (Word cannot draw Mermaid by itself).

## Source files

| Source | Output |
|--------|--------|
| [`../PROJECT_DOCUMENTATION.md`](../PROJECT_DOCUMENTATION.md) | `out/PROJECT_DOCUMENTATION.docx` + `.html` |
| [`../PROJECT_VISUAL.md`](../PROJECT_VISUAL.md) | `out/PROJECT_VISUAL.docx` + `.html` + diagram PNGs |

## One-time setup

```bash
cd "d:\Ali Fayaz Projects\WMS\docs-export"
npm install
```

Requires **Node.js** (already used by the WMS app). No Pandoc install needed.

## Export

```bash
cd "d:\Ali Fayaz Projects\WMS\docs-export"
npm run export
```

### What you get in `out/`

| File | Use |
|------|-----|
| `PROJECT_VISUAL.docx` | Open in **Microsoft Word** — diagrams appear as pictures |
| `PROJECT_DOCUMENTATION.docx` | Full text/tables manual in Word |
| `PROJECT_VISUAL.embedded.html` | Best on-screen view; zoom diagrams in the browser |
| `PROJECT_VISUAL.html` | Same content; images loaded from `out/images/` |
| `images/*.png` | Individual diagrams (paste into PowerPoint if needed) |
| `*.rendered.md` | Markdown with image links instead of Mermaid blocks |

## How to view diagrams clearly

1. **Word:** double-click `out/PROJECT_VISUAL.docx`.
2. **Browser (recommended for zoom):** open `out/PROJECT_VISUAL.embedded.html`.
3. **PDF:** in the browser, **Print → Microsoft Print to PDF** (or Save as PDF).
4. **Quick preview in Cursor:** open `PROJECT_VISUAL.md` and use a Mermaid Markdown preview extension (source only; Word needs the export above).

## Re-run after doc updates

Whenever you edit `PROJECT_DOCUMENTATION.md` or `PROJECT_VISUAL.md`:

```bash
npm run export
```

## Notes

- Diagrams are rendered with `@mermaid-js/mermaid-cli` (Chromium-based). First install may download a browser binary and take a few minutes.
- If a single diagram fails, the export continues and inserts an error note in that spot; check the console log.
- Application backend/frontend code is not modified by this folder.
