# 05-impl-style

Implementation style core. Stack variants are inline sections below; pick the one matching the session's active language. Apply these defaults to every PATCH unless the target repo's `## Project Style Policy` section or the INTAKE `Stack/Style:` field overrides them.

## Defaults for all stacks

- Naming: snake_case for variables/functions, PascalCase for types/classes, UPPER_SNAKE_CASE for constants. Match the existing local convention when one is dominant.
- File naming: kebab-case for files, PascalCase only for class-bearing files when local convention is clear.
- Imports: ESM `import` over CJS `require`; explicit named imports over `import *`; `import type` for type-only imports.
- Comments: only when explaining _why_ (not _what_). No banner comments, no decorative ASCII, no per-function docstrings on self-evident code. The comment taxonomy lives below.
- Error handling: do not swallow exceptions. Propagate with added context, or return a typed Result/Error variant. Match the file's existing idiom (H12).
- Functions: single responsibility; stepdown rule (S14); no flag arguments (S16).
- Tests: one assertion focus per test; arrange-act-assert; fixtures for shared setup; no test interdependence.

## Comments

The comment taxonomy:

- **Why-comments only**: explain _why_ a non-obvious decision was made, what the constraint is, or what would break. Example: `# pyrefly: ignore -- third-party stubs ship later` (binding) or `# Cache invalidation runs here because the parent transaction has not committed yet` (explains ordering).
- **No what-comments**: do not narrate the next line. The code is what; the comment is why.
- **No decorative banners**: no `// ====`, `// #region`, `// --- SECTION ---` separators; the file structure and naming carry that signal.
- **No per-function docstrings on self-evident code**: short, well-named functions do not need a docstring that restates the name.
- **Public-API docstrings stay**: exported functions, public types, and CLI entry points keep a one-line docstring describing contract, not implementation.
- **Forbidden-list markers stay**: H1 guard markers, `# pyrefly: ignore`, lint-disable comments are content, not noise.
- **TODO/FIXME/XXX**: allowed with a dated ticket reference. Bare TODO without a ticket is allowed only when the issue is captured in the same response's `# Open questions`.

## Style floor

The defaults above are a floor, not a ceiling. They never replace the per-edit lint gate or the project checks; they are the minimum, not the maximum. The project style policy in `AGENTS.md` (`preserve-local` or `upgrade-house-style`) controls how the floor interacts with the file's existing style.

## Stack: TypeScript / JavaScript

- Strict mode: `"strict": true` in `tsconfig.json`. `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
- `any` is forbidden; use `unknown` and narrow.
- `as` casts require a follow-up type guard or `// @ts-expect-error: <reason>` (binding) with a one-line reason.
- `null` vs `undefined`: prefer `undefined` for "not set" and `null` only when an API contract demands it.
- Async: `async/await` over `.then` chains; `Promise.all` for independent work; never fire-and-forget without a documented reason.
- Errors: typed error subclasses or discriminated unions; `try/catch` only around the failing call, not around the whole function; never `catch (e) {}`.
- Imports: `import { foo } from './foo'` over `import * as foo from './foo'`. `import type { Foo } from './foo'` for types.
- Exports: named exports over default exports except where the framework requires a default (React components, route handlers).
- React (when in scope): function components over class components; hooks at the top level, never in conditionals; props typed via interface or `type`; `useEffect` cleanup function for every subscription; no inline object/array literals in dependency arrays.
- Node (when in scope): `node:` prefix on built-in imports (`node:fs`, `node:path`); ESM by default; `process.exit` only at the top of the entry point.

## Stack: Python

- Type annotations on every function signature: parameters and return type. `Any` requires inline `# pyrefly: ignore` with reason (H10).
- Modern type syntax: `list[int]`, `dict[str, int]`, `X | None` over `Optional[X]`, `from __future__ import annotations` only when needed for forward refs.
- Naming: snake_case for functions/variables/modules, PascalCase for classes, UPPER_SNAKE_CASE for constants.
- Imports: `from x import y` style; `__init__.py` re-exports; no wildcard imports.
- Errors: raise specific exceptions; chain with `raise NewError(...) from original`; never bare `except:` or `except Exception:` without re-raise.
- Tests: pytest with `arrange-act-assert`; fixtures for setup; parametrize for input variation; no test interdependence.
- Async: `asyncio` over thread pools; `async def` only when I/O-bound and the codebase is async; never mix sync and async in the same call chain.
- Package management: prefer `uv` or `poetry` over `pip + requirements.txt`; lockfile is committed.
- Linting: `ruff` (lint + format) or `black + isort + flake8`; pre-commit hooks run them on save.

## Stack: Java

- Java 17+ minimum; records and sealed classes for value types and closed hierarchies.
- Naming: PascalCase for classes/interfaces, camelCase for methods/fields, UPPER_SNAKE_CASE for constants.
- Imports: no wildcard imports; explicit imports only.
- Errors: typed exceptions; checked exceptions for recoverable conditions, unchecked for programming errors; never swallow.
- Streams: `stream()` for transformations, but a `for` loop is fine for side effects; no nested streams (S3).
- Tests: JUnit 5; `@DisplayName` for human-readable test names; one assertion focus per test.
- Build: Maven or Gradle; wrapper committed; lockfile equivalent (`maven.lock` or `gradle.lockfile`) for reproducible builds.
- Linting: Spotless or Checkstyle; pre-commit hook runs it on save.

## Stack: Frontend (Vue / Svelte / general)

- Vue 3 composition API with `<script setup lang="ts">`; props typed via `defineProps<{ ... }>()`; emits typed via `defineEmits<{ ... }>()`.
- Svelte 5 runes (`$state`, `$derived`, `$effect`); props typed via `let { x }: { x: number } = $props()`.
- CSS: scoped styles; CSS custom properties for theming; no inline styles except for dynamic values.
- State: Pinia (Vue) or stores (Svelte); never component-to-component mutation through props drilling more than one level.
- Accessibility: ARIA only when semantic HTML cannot express the relationship; keyboard navigation for every interactive element; `prefers-reduced-motion` respected.

## Stack: PowerShell

- Approved verbs (`Get-`, `Set-`, `New-`, `Remove-`, `Test-`, `Start-`, `Stop-`); `Update-` only when no approved verb fits and the deviation is documented.
- Cmdlet naming: singular noun, not plural; parameter names hyphenated (`-Path`, not `-FilePath`).
- Error handling: `$ErrorActionPreference = 'Stop'` at the top of scripts; `try/catch/finally`; never silently `continue` on a non-zero exit code.
- Output: `Write-Host` for user-facing messages, `Write-Output` (or implicit) for pipeline data, `Write-Verbose` for diagnostics. Never `Write-Host` for data the caller needs to consume.
- Modules: `Export-ModuleMember` for explicit public surface; `using module` (not `Import-Module` inline) when the module is a class library.
- Tests: Pester with `Describe`/`Context`/`It`; `Should -Be` / `Should -Throw` / `Should -Invoke`; mock with `Mock`.

## Stack: Pine Script

- Pine v6 or later; `indicator()` or `strategy()` declaration at the top of the script.
- Naming: PascalCase for functions and types, camelCase for variables, UPPER_SNAKE_CASE for constants.
- Inputs: `input.int`, `input.float`, `input.bool`, `input.string`, `input.color`, `input.timeframe` with explicit `title=` and `tooltip=`.
- Plots: `plot` only after `indicator()`; `plotshape` for markers; `bgcolor` for context bands.
- Errors: `runtime.error()` for unrecoverable conditions; `assert` only for invariant checks; never swallow `runtime.error`.
- Performance: no `for` loops over `bar_index` ranges; use built-in functions (`ta.crossover`, `ta.highest`) for O(1) equivalents.
- Testing: TradingView's built-in strategy tester for backtests; manual visual inspection for indicator behavior.

## Stack: Database

- Schema design: 3NF minimum, denormalize only with documented reason; every foreign key has a matching index.
- Naming: snake_case for tables and columns; plural table names (`users`, not `user`); singular column names for scalar fields.
- Migrations: forward-only, one change per migration, named with timestamp + description; never edit a migration after it has been applied.
- Indexes: every foreign key, every column referenced in `WHERE` for non-trivial queries, every column used in `ORDER BY` for sort.
- Queries: parameterized only; no string concatenation; `EXPLAIN ANALYZE` reviewed for queries over 100ms.
- Transactions: every multi-statement write wraps in a transaction; isolation level chosen explicitly, not defaulted.
