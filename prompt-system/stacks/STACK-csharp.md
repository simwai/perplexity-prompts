# Stack: CSharp

- Target: .NET 8+ (LTS). Note: .NET 8 reaches end of support November 2026 -- prefer .NET 8 with a planned upgrade path, or .NET 9+ for new work. Nullable reference types enabled (`<Nullable>enable</Nullable>` in `.csproj`)
- Naming: PascalCase for types, methods, public properties; `_camelCase` for private/protected fields; camelCase for locals/parameters; interfaces prefixed with `I` (`IDisposable`); two-letter acronyms fully capitalized (`IO`, `UI`); three+ letters PascalCase (`Xml`, `Http`)
- File layout: one public type per file; filename matches type name (`MyClass.cs`); `using` directives outside namespace; System namespaces first, sorted; no wildcard imports; no `#region`
- Formatting: 4-space indent (no tabs); Allman braces (opening brace on new line); always use braces for `if/else/while`; single space after control-flow keywords; soft limit 100–150 chars; dot/operator at start of continuation lines
- Language features: prefer `is` pattern matching over `as` + null check; avoid `var` when type not obvious; prefer `class` over `struct`; use `const`/`readonly` over magic numbers; no `Tuple<>` in public APIs (use records); `out` for output-only params after all others; `ref` only when genuinely needed; prefer `StringBuilder`/interpolation over `+` concatenation
- Collections: most restrictive interface for inputs (`IReadOnlyCollection<T>`, `IReadOnlyList<T>`, `IEnumerable<T>`); `IList<T>` for output ownership; `List<T>` over arrays for public APIs; arrays for fixed-size/multidimensional
- Error handling: throw exceptions for failures; provide `TryXxx` pattern for common non-exceptional failure (stack-mandated `out` parameters are excepted from rubric H30 via its Try idiom auto-exception); validate parameters at public API entry (`ArgumentException`, `ArgumentNullException`, `ArgumentOutOfRangeException`); handle out-of-range enum values explicitly; never swallow exceptions silently
- DI container: **Microsoft.Extensions.DependencyInjection** (built-in); constructor injection; wire composition root at `Program.cs`/`Startup.cs`; default to transient unless singleton/scoped rationale exists
- ORM: **Entity Framework Core** with `DbContext`; prefer `[Key]` attribute or Fluent API for configuration
- Validation: **FluentValidation** for complex rules; `System.ComponentModel.DataAnnotations` for simple attributes
- Testing: **xUnit** with `[Fact]`/`[Theory]`; `FluentAssertions` for readable assertions; `Moq` for mocking
- Tooling: **dotnet format** (built-in); **Roslyn analyzers** (`Microsoft.CodeAnalysis.NetAnalyzers`, `StyleCop.Analyzers`); **Serilog** for structured logging
- Build: `dotnet build` / `dotnet test`; `global.json` to pin SDK version
- Documentation: XML doc comments on all public/protected members (`<summary>`, `<param>`, `<returns>`, `<exception>`, `<remarks>`); `<inheritdoc/>` for overrides; TODO comments must reference work item (`AB#nnnnnn`)
