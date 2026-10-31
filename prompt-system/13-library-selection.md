# 13-library-selection

Third-party library adoption protocol. Loaded on demand when a session introduces or substantially expands a dependency (trigger T-26 in `prompt-system/11-triggers.md`). Extracted from `prompt-system/07-protocols.md` during the load-tier split; H8 remains the hard-tier audit for known CVEs and unreviewed dependency versions.

## Library selection

Use before introducing or substantially expanding a third-party library dependency.

### Selection signals

Evaluate the candidate against the project's actual runtime, distribution model, and maintenance capacity. A single attractive signal is not sufficient.

- **Value density:** Prefer libraries that remove error-prone domain logic or a meaningful amount of manual implementation, not merely a few lines of boilerplate. Saving code is evidence only when the replaced code would be difficult to implement, secure, test, or maintain correctly by hand.

- **Maintenance:** Check recent releases, issue and pull-request activity, supported runtime versions, release ownership, and whether the project is archived or effectively abandoned.

- **Security:** Check published advisories, dependency health, release provenance, and whether security fixes can be adopted without a forced major migration.

- **Type safety:** Prefer libraries with first-party types, a `py.typed` marker, typeshed stubs, or TypeScript declarations when the project uses a typed language.

- **API and ecosystem fit:** Prefer stable, documented APIs that match the project's runtime, framework, error-handling style, and deployment model.

- **Dependency footprint:** Check transitive dependencies, native/runtime requirements, bundle or image impact, and operational complexity.

- **Migration path:** Confirm upgrade guidance, compatibility policy, and the cost of replacing the library if it becomes unsuitable.

### License and distribution check

- Identify whether the project is internal, delivered as SaaS, distributed as a binary, or redistributed as source or a package.

- Record the candidate's SPDX license and the licenses of its transitive dependencies.

- Prefer well-understood permissive licenses such as MIT, BSD-2-Clause, BSD-3-Clause, and Apache-2.0 when they fit the distribution model.

- Require legal review before adopting copyleft, source-available, custom, or otherwise unfamiliar licenses.

- Document required attribution, notices, source-disclosure, network-use, or other license obligations before adoption.

- Reject a candidate when its obligations conflict with the distribution model, or when license metadata is missing, contradictory, or unverifiable.

### Selection blockers

Do not adopt the candidate without an explicit exception when it is archived or unmaintained, has an unresolved known vulnerability, has incompatible license obligations, lacks required type support, has unverifiable provenance, or has no credible upgrade or replacement path.

### Evidence and decision record

- Record the chosen library, exact version, alternatives considered, decision rationale, and any accepted exceptions.

- During DOCS, verify the official documentation URL, exact version, and changelog window for the last two major versions when relevant.

- H8 remains the hard-tier audit for known CVEs and unreviewed dependency versions. This section governs selection before adoption; it does not replace the review rubric.

### Library selection (API-relevant)

When choosing libraries for an API surface, evaluate against `## Library selection` above plus the API-specific signals:

- **Schema-first vs code-first.** The project chooses one and sticks with it. A repo with a hand-authored `openapi.yaml` and a code-first generator is a maintenance trap; pick one and reject the other.

- **Validation library parity.** The library that validates incoming requests is the same one that defines the OpenAPI schemas (`zod` + `zod-to-openapi`, `pydantic` + FastAPI, `class-validator` + NestJS). Two sources of truth for the same shape is a drift surface.

- **Rate-limiting library.** Token-bucket or sliding-window only; fixed-window is rejected per the rate-limiting rules. The library must support per-principal keys and the standard response headers without a custom middleware.

- **API client generation.** When the API has multiple consumers in the same org, the OpenAPI document is consumed by a client generator (openapi-generator, orval, fern) to produce typed clients in the consumer repos. Hand-written clients drift; generated clients track the contract.

- **Test framework contract support.** Pact, Dredd, Spectral, or schemathesis provide contract tests against the running service. The chosen tool runs in CI against a deployed preview environment, not only against local handlers.
