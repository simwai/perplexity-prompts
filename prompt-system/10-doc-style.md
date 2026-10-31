# 10-doc-style

Documentation Style -- loaded on `.md` edits. These conventions apply to every tracked `.md` file in this repository. Enforced via the pre-commit hook.

## File Naming

Naming differs by location, because the two trees have different owners.

- `prompt-system/` is the deployed unit and follows the repository default: **kebab-case** filenames (`05-impl-style.md`, `04b-rubrics-logical.md`), per `05-impl-style.md` `## File naming`.

- Repository-root documentation files use **UPPER_SNAKE_CASE** with a `.md` extension (`AGENTS.md`, `CHANGELOG.md`, `GLOSSARY.md`, `SPEC.md`, `STYLE_POLICY.md`, `TASKS.md`). Acronyms stay uppercase (`TRELLO_INTEGRATION.md`, not `Trello_Integration.md`).

- Directories use **kebab-case** (`prompt-system/stacks/`, `adapters/`, `scripts/`, `stacks/`).

- `CHANGELOG.md` -- generated from Conventional Commits from `v1.0.0` forward; do not hand-edit the generated body, run `npm run changelog`.

- `CHANGELOG_ARCHIVE.md` -- frozen hand-written history through `v1.0.0`. It names files and anchors that have since moved. It is exempt from the cross-reference integrity suite and from any doc rewrite; correcting it would falsify a historical record.

- `LICENSE` -- ISC, matching the `license` field in `package.json`. The two must agree; the file is the one that is legally operative.

Every documentation file ends with `.md`.

## Glossary

The canonical glossary lives at **`GLOSSARY.md`** in the repository root. Maintained manually; updated when new terminology enters the system.

## Auto-Generated Table of Contents

TOCs are optional and generated manually with `markdown-toc` where a TOC adds navigational value; they are not part of the pre-commit gate.

- **Depth**: Up to 3 heading levels (`--maxdepth=3`)
- **First H1**: Not used as TOC anchor (`--no-first-h1`)
- **Insertion**: `markdown-toc` only rewrites a file that already carries its TOC marker or an insertable position (`<!-- toc -->`). A file with no TOC is a style choice, not a lint failure.

## Links versus path mentions

A reader on a forge has to click. Two rules:

- **Navigation is links.** A table whose cells are the paths to the documents a reader is being sent to -- a README hub, a `Go To` table, a `Related` footer -- uses real Markdown links. Backticked paths in those positions are decoration that reads like navigation and navigates nowhere.
- **Prose is paths.** Everywhere else, a file reference stays a backticked path (`prompt-system/05-impl-style.md`). Converting prose mentions into links adds noise without adding navigation.

Relative depth matters: from `user-guide/`, a sibling is `PHASES.md`, a repository-root document is `../SYSTEM_OVERVIEW.md`, and a system file is `../prompt-system/00-system.md`. Getting this wrong produces a link that renders fine and 404s.

## Emoji

Emoji are decorative by default and are removed. Keep one only when the glyph
carries meaning the surrounding words do not:

- `✅` / `❌` where a table cell is nothing but the verdict
- `⚠️` on a genuinely cautionary section

Heading icons, blockquote leads, layer dots in tables, and glyphs in Mermaid
node labels are decoration and are removed. A heading icon repeated on every
heading stops being a signal and becomes a font.

## Mermaid Diagrams

All diagrams use **GitHub-flavored Mermaid** syntax inside fenced code blocks.

A diagram that fails to parse renders as a syntax-error box on GitHub, and
nothing else in this repository notices: markdownlint checks Markdown rather
than diagram grammar, and the cross-reference suite checks citations rather than
diagram bodies. `scripts/test-mermaid.ps1` closes that gap by handing each
Markdown file to mermaid-cli's Markdown mode, which extracts and renders every
fenced mermaid block in it. It runs in the commit gate as step 4, scoped to
staged Markdown, and skips files with no mermaid fence without starting a
browser. Run it manually with `npm run lint:mermaid`.

- Every mermaid block starts with `%%{init: {'theme': 'dark'}}%%`
- **Primary color**: `#6B21A8` (Dark Purple)
- **Accent color**: `#06B6D4` (Cyan)
- **Background**: Dark transparent (GitHub dark mode renders automatically)
- Declare the diagram type with `flowchart TD` or `flowchart LR`, not the older `graph TD` / `graph LR`. `flowchart` is the current form and supports everything `graph` does.
- Colors are applied with `classDef` plus `class`, as below.
- **`classDef` must appear after the diagram declaration.** A `classDef` placed between the `%%{init}%%` directive and the `flowchart` line makes Mermaid fail to detect the diagram type and render nothing at all.
- **Quote any node label containing a space, a parenthesis, or a question mark**: `AUTO{"AUTO (default)"}`, not `AUTO{AUTO (default)}`. Unquoted braces are not valid grammar for labels with spaces or parentheses, and the diagram renders as a syntax-error box.
- Use `<br/>` for a line break inside a label. `\n` is tolerated by current Mermaid but is not the documented form.

  ```mermaid
  %%{init: {'theme': 'dark'}}%%
  flowchart TD
      A[Task] --> B{"Mode?"}
      B -->|Low risk| C[DIRECT]

      classDef entry fill:#6B21A8,stroke:#7C3AED,color:#fff;
      classDef mode fill:#06B6D4,stroke:#22D3EE,color:#000;

      class A entry
      class B,C mode
  ```

## SVG Images

SVG images follow a **dark purple + cyan cyberpunk** aesthetic.

| Role | Color | Hex |
|---|---|---|
| Primary | Dark Purple | `#6B21A8` |
| Primary Light | Purple | `#7C3AED` |
| Accent | Cyan | `#06B6D4` |
| Accent Light | Cyan Light | `#22D3EE` |
| Background | Dark | `#0F0A1A` |
| Text | Light | `#E2E8F0` |
| Border | Purple Dim | `#4C1D95` |

- All SVG files use the dark purple + cyan palette
- Background is dark (`#0F0A1A` or transparent)
- Strokes and fills use the palette colors above
- Text uses light color (`#E2E8F0`) for contrast
- SVGs should be self-contained (no external dependencies)

## Markdown Linting

All `.md` files are linted via `.markdownlint.jsonc`.

| Rule | Setting | Purpose |
|---|---|---|
| MD013 | `line_length: 1000` | Long prose lines should stay under 1000 characters; code blocks are excluded |
| MD041 | `false` | First heading can be after frontmatter/tags |
| MD024 | `siblings_only: true` | Duplicate headings allowed across sections |
| MD033 | `false` | Inline HTML tags allowed (protocol markers) |
| MD060 | `false` | Table column alignment not enforced |
| MD012 | `false` | Multiple blank lines at EOF allowed |
