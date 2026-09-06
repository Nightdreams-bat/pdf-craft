---
name: pdf-craft
description: Produce PDFs and print-quality documents that look designed rather than defaulted. Use whenever the user asks for a PDF, report, memo, proposal, brief, whitepaper, manual, one-pager, or any document meant to be read as a finished artifact - and especially when they say a document looks boring, generic, or "the same as last time".
---

# PDF Craft

Claude's default document is instantly recognizable: Helvetica or Times, a centered bold
title, an unbroken ladder of H1/H2/H3, bullets everywhere, one blue accent, uniform
margins. It reads as an outline someone forgot to design. This skill replaces that with a
deliberate typographic choice per document, and forces those choices to differ across
documents.

Two failures to prevent, in order:

1. **Boring** - no design decision was made, so the default happened.
2. **Same** - a decision was made once and then repeated forever.

## Workflow

### 1. Write the design brief first

Before any HTML, state these five decisions in one short block and put them as an HTML
comment at the top of the file. No brief, no document.

| Decision | Forced by |
|---|---|
| **Archetype** | What the reader does with it - decide, skim, follow, study, be persuaded |
| **House style** | Section below; must differ from the last entry in the ledger |
| **Page** | Size + margin; A4 is a default, not a decision |
| **Type pair** | Text face + display face, with weights |
| **Accent** | One accent + one neutral ink. Never a gradient |

### 2. Check the ledger, then pick a different style

```bash
tail -5 ~/.claude/skills/pdf-craft/.ledger 2>/dev/null
```

Do not reuse the most recent house style unless the archetype genuinely demands it. If it
does, change the page geometry and type pair so the document still reads as its own thing.
After rendering, append one line:

```bash
echo "$(date +%F) | <style> | <doc name>" >> ~/.claude/skills/pdf-craft/.ledger
```

### 3. Fetch fonts (only if using webfonts)

```bash
node ~/.claude/skills/pdf-craft/scripts/getfont.mjs "Newsreader:400,600,400italic" "Sora:600"
```

Prints `@font-face` CSS pointing at local cached files - paste it into the document's
`<style>`. Skip this entirely and use the verified local fonts if offline.

### 4. Render

```bash
node ~/.claude/skills/pdf-craft/scripts/topdf.mjs doc.html --out=doc.pdf --margin=20 \
     --header="Document title" [--footer="Confidential"] [--no-number] [--landscape]
```

Page numbers are on by default. The renderer waits for webfonts and **prints
`WARNING unloaded @font-face:`** if any failed - never ignore that line, it means the PDF
silently fell back to Times.

### 5. Verify before reporting done

```bash
node ~/.claude/skills/pdf-craft/scripts/checkpdf.mjs doc.pdf
```

Confirms page count, page size, and embedded fonts. If `TimesNewRoman` appears and you did
not ask for it, a font failed - fix it before showing the user.

## Environment facts (verified on this machine - do not re-derive)

- Renderer is headless Chrome via DevTools Protocol. No pandoc, weasyprint, or typst.
- **Variable fonts do not embed. They fall back to Times, silently.** This killed
  Bahnschrift, Sitka Text, and Fraunces VF in testing. Use static instances only.
- **Headless Chrome will not fetch remote fonts.** A Google Fonts `@import` or `<link>`
  loads nothing, even with a long `--virtual-time-budget`. Fonts must be downloaded and
  referenced as local `file:///` URLs - that is what `getfont.mjs` does.
- **Google's API serves a variable file when you request several weights at once**, and a
  true static instance when you request one weight at a time. `getfont.mjs` handles this.
- **Quote every multi-word font family in CSS.** Unquoted `Sitka Text` can invalidate the
  whole declaration and drop you to Times.
- `@page { size: ... }` is honored. Set **size only** - margins come from `--margin`,
  because the header and footer sit in that space.
- Chrome ignores `@page` margin boxes (`@bottom-center`), which is why page numbers come
  from the renderer instead.

### Local fonts, verified to embed

Serif: `Georgia` `Constantia` `Cambria` `Palatino Linotype` `Book Antiqua`
`Bookman Old Style` `Garamond` `Century`
Sans: `Candara` `Corbel` `Segoe UI` `Franklin Gothic Medium` `Century Gothic`
`Trebuchet MS` `Verdana` `Tahoma` `Calibri` `Arial Narrow` `Ebrima` `Gadugi`
Mono: `Consolas` `Lucida Console`

Always end a stack with a generic: `font-family: "Constantia", Georgia, serif`.

## House styles

Pick by archetype. Each is a full specification - do not blend them into mush.
`example/editorial.html` is a working implementation of style A (floated margin
sidenotes, raised initial, book-style paragraph indents) - read it before building
a document from scratch.

### A. Editorial - long-form report, essay, whitepaper
Reader studies it. Asymmetric page: a wide text column with a narrow sidenote margin.
- Page A4, `--margin=22`, text column ~110mm, sidenotes in the outer margin
- Type: `Newsreader:400,600,400italic` text at 11pt/1.55 + `Sora:600` display
  (local: `Constantia` + `Corbel`)
- Ink `#1b1917` on `#fdfcfa`; accent `#8a3324` (burnt sienna)
- Hierarchy: headings by weight and space, not size jumps. No rules
- Signature: sidenotes set at 8.5pt in the margin; opening paragraph with a raised initial

### B. Technical brief - RFC, design doc, postmortem
Reader navigates and cites. Numbered, dense, scannable.
- Page A4, `--margin=18`, single column
- Type: `IBM Plex Sans:400,600` + `IBM Plex Mono:400` (local: `Segoe UI` + `Consolas`)
- Ink `#111418`; accent `#0f6b5c` (deep teal); rules `#d8dde3`
- Hierarchy: decimal numbering (`1.`, `1.1`) hanging in the margin, hairline rule under H2
- Signature: spec tables with tabular numerals; inline code on a tinted ground

### C. Executive memo - decision document, 1-3 pages
Reader decides in ninety seconds. Whitespace is the design.
- Page A4, `--margin=28`, short measure (~95mm), lots of air
- Type: `Source Serif 4:400,600` at 11.5pt/1.6 (local: `Palatino Linotype` + `Candara`)
- Ink `#1a1a1a` on white; accent `#7a5c2e` (bronze)
- Hierarchy: a boxed **Decision required** block at the top, then at most two levels
- Signature: lead paragraph at 13pt; bullets banned - use short prose blocks

### D. Data report - metrics, tables, charts
Reader compares numbers. Typography serves the table.
- Page A4, `--landscape` when tables are wide, `--margin=16`
- Type: `Inter:400,600` with `font-feature-settings:"tnum"` (local: `Corbel`, which has
  real tabular figures)
- Ink `#15181d`; accent `#1f5f8b`; positive `#2f7a4d`, negative `#a33a2e`
- Hierarchy: table rules only at header and total; no zebra striping, no vertical rules
- Signature: numbers right-aligned on the decimal, units in the header not the cells

### E. Field guide - manual, runbook, how-to
Reader follows along, hands busy.
- Page A5 (`@page{size:148mm 210mm}`) or A4 two-column, `--margin=16`
- Type: `Atkinson Hyperlegible:400,700` (local: `Verdana` + `Franklin Gothic Medium`)
- Ink `#1c1c1c`; accent `#b4531a`; caution ground `#fff4e6`
- Hierarchy: big numbered step markers hanging in the left margin
- Signature: each step is a `break-inside: avoid` block; callouts as tinted panels

### F. Proposal - pitch, client-facing, persuasive
Reader is being convinced. Presentation matters more than density.
- Page A4, `--margin=20`, cover page plus section openers
- Type: `Fraunces:600` display (static only) + `Work Sans:400,500` text
  (local: `Book Antiqua` + `Segoe UI`)
- Ink `#14161a`; accent from the client's brand if known, else `#2d4a7c`
- Hierarchy: full-width section openers with the number set large and pale
- Signature: cover with a full-bleed accent band; pull quotes at 16pt between sections

## Never (these are the default tells)

- Arial, Helvetica, Times, or Calibri as the *chosen* text face
- A centered bold title followed immediately by H1/H2/H3 with nothing between
- Bullets as the primary structure - most points are sentences
- Generic blue `#2563eb`-family accents; purple gradients; emoji as bullets or icons
- Uniform margins on every side with a full-measure text column (over 90 characters)
- Equal vertical space above and below a heading - space belongs above
- More than three type sizes, or bold used for more than one job
- Tables with a grey header, full gridlines, and zebra stripes

## Print craft

```css
@page { size: A4 }                      /* size only - margins come from --margin */
body { margin: 0; -webkit-print-color-adjust: exact; text-wrap: pretty }
p { orphans: 3; widows: 3; margin: 0 0 0.7em }
h1, h2, h3 { break-after: avoid; margin: 1.6em 0 0.45em }   /* space above, not below */
figure, table, .step, blockquote { break-inside: avoid }
thead { display: table-header-group }    /* repeats headers across page breaks */
.page-break { break-before: page }
td.num { font-variant-numeric: tabular-nums; text-align: right }
```

- Measure: 60-75 characters. Shorten the column, do not widen the margin.
- Images and any local asset need `file:///` URLs to load.
- `break-inside: avoid` is the reliable guarantee; treat `orphans` and `widows` as hints.
- Set the leading with the measure: longer line, more leading.

## Quick prompt version

When the skill is not available (claude.ai, another tool), paste this:

> Before writing anything, give me a five-line design brief: archetype, house style, page
> size and margin, type pairing with weights, and one accent colour. Then build the
> document to that brief. Banned: Arial/Helvetica/Times/Calibri as the chosen face,
> centered bold title over an H1/H2/H3 ladder, bullets as the main structure, generic blue
> accents, gradients, emoji bullets, uniform margins with a full-width text column, more
> than three type sizes. Space goes above headings, not below. Measure stays 60-75
> characters. Tell me which style you chose last time and pick a different one.
