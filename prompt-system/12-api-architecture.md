# 12-api-architecture

REST/HTTP API design protocol. Loaded on demand when the session touches a service boundary (trigger T-25 in `prompt-system/11-triggers.md`). Extracted from `prompt-system/07-protocols.md` during the load-tier split.

## API architecture & design

Cross-cutting protocol for REST/HTTP APIs. Loaded when a session touches a service boundary: a new endpoint, a contract change, a versioning decision, a rate-limit policy, or an OpenAPI document. Complements `prompt-system/13-library-selection.md` `## Library selection` and `prompt-system/07-protocols.md` `## Cross-team requirements`; overlaps with `prompt-system/05-impl-style.md` `## Security defaults` (parameterized queries, transactions).

### Resource modeling

- Model the API around **resources**, not database tables. A resource is a noun the client can name (`Order`, `Invoice`, `Refund`); a table is an implementation detail. Field names in the JSON contract reflect the resource domain, not the storage schema.

- Use **plural nouns for collection endpoints** (`/orders`, `/users/{id}/sessions`). Singular nouns only for singleton resources that have exactly one instance per parent (`/me`, `/account`).

- **Nested resources only one level deep.** `/users/{id}/sessions` is fine; `/users/{id}/sessions/{sid}/messages/{mid}/reactions` is not -- flatten with a query parameter (`/messages?session_id=...`) or promote to a top-level resource. Deep nesting forces clients to know the hierarchy and complicates authorization.

- **Relationships by link, not by embedded object.** References a related resource by its URL (`"customer": "/customers/42"`) or by a stable ID + the canonical URL pattern, not by embedding the full related object. Embedding creates fan-out and staleness; link-by-URL makes the contract stable across schema changes. Inline expansion, when needed, is opt-in via `?expand=customer` and documented per endpoint.

- **Identifiers are opaque strings on the wire.** Never expose internal integer IDs without a layer that decouples them from the storage. UUIDv4 or ULID for new resources; existing integer IDs are acceptable when the contract predates this rule and migration is non-trivial, but new endpoints must use opaque strings.

- **Field naming consistency.** Pick one case style (camelCase for JSON across the board, or snake_case) and enforce it for the entire API surface. Mixed casing in one response is a contract defect. Date-time fields are always `snake_case` strings in ISO-8601 with explicit timezone offset (or `Z`); pick one and document it.

### HTTP semantics

- **Verbs map to CRUD, not to business actions.** `POST /orders` creates; `GET /orders/{id}` reads; `PATCH /orders/{id}` updates; `DELETE /orders/{id}` removes. A business action that does not map to CRUD (refund, cancel, approve) is a **sub-resource or action endpoint** with a verb-friendly noun: `POST /orders/{id}/refunds`, `POST /orders/{id}/cancellation`. The action is its own resource whose creation represents the operation.

- **Status codes carry meaning.** Use the standard set: `200` (read success), `201` (create with `Location` header pointing to the new resource), `204` (delete / no-body success), `400` (validation), `401` (no/invalid credentials), `403` (authenticated but forbidden), `404` (resource absent), `409` (state conflict -- duplicate, version mismatch, precondition failed), `422` (semantic validation -- well-formed but business-rule rejected), `429` (rate-limited), `5xx` (server fault, never deliberately returned). Never use `200` for a failure; never use `500` for a client error.

- **Idempotency keys on every mutating endpoint** that may be retried by the client (network timeouts, mobile reconnects, webhook redeliveries). The header is `Idempotency-Key`; the value is a client-generated UUID; the server stores the key with the response for at least 24 hours and replays the stored response on duplicate requests. A missing key on a retried request must not silently double-charge.

- **Content negotiation.** `Accept` header selects representation (`application/json` default; `application/problem+json` for errors per RFC 7807). The server picks one canonical content type and rejects others with `406 Not Acceptable` rather than silently returning a different shape.

- **HEAD and OPTIONS** are first-class: HEAD mirrors GET without a body and must succeed whenever GET would; OPTIONS returns the allowed methods and CORS headers without authentication. Free with most frameworks; required when the API is publicly consumed.

- **No verbs in the path.** `/api/getUser` is a RPC disguised as REST. The verb is the HTTP method; the path names the resource. Exceptions documented per-endpoint (search, action endpoints) do not change the rule.

- **Trailing slashes are a contract.** Pick one (`/orders` or `/orders/`) and reject the other with a `301` redirect or `404`. Mismatched redirect behavior across endpoints confuses client caching.

### Error response shape

One canonical error shape across the entire API. Use RFC 7807 `application/problem+json` as the default for new APIs; a custom shape is acceptable only when RFC 7807 is documented as a deliberate deviation.

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "One or more fields failed validation",
  "instance": "/orders",
  "errors": [
    { "field": "quantity", "code": "must_be_positive", "message": "quantity must be > 0" }
  ]
}
```

Hard rules:

- `type` is a URI (URL or URN) the client can dereference for human-readable documentation. It is stable; renaming it is a breaking change.

- `title` is human-readable summary, stable per `type`.

- `status` mirrors the HTTP status code; the body never lies about the status.

- `detail` is the human-readable explanation for *this* occurrence (may include field values); safe to surface in UI.

- `instance` is the request path that produced the error; never the internal trace ID.

- `errors[]` is a per-field detail array for `400`/`422`; absent for non-validation errors.

- **No stack traces, no internal paths, no SQL fragments, no secret material in the response body** (H7). The trace ID belongs in a `Trace-Id` response header, surfaced in trusted internal logs only.

- Internal server errors return a generic body (`"title": "Internal Server Error"`, no `detail`, no `errors`) and a unique `Trace-Id`; the same `Trace-Id` is logged server-side for correlation.

### Versioning

- **Version the URI path**, not the header, unless the project has a strong reason to choose header-based versioning. URI versioning is observable in logs, caches, and proxies without parsing headers. Canonical shape: `/v1/orders`, `/v2/orders`.

- **Major versions are breaking changes.** Adding a field, adding an endpoint, relaxing a validation rule, or adding an optional query parameter is **not** a breaking change. Removing a field, renaming a field, tightening a validation rule, changing a status code, or changing the meaning of an existing code is breaking and requires a new major version.

- **Sunset policy.** When a version is deprecated, the response carries a `Sunset` HTTP header (RFC 8594) and a `Deprecation` header (RFC 9745) on every endpoint. The `Sunset` value is an HTTP date at least 90 days in the future for public APIs; internal APIs may use a shorter window with explicit user acceptance. Documentation lists the sunset date and the recommended migration target.

- **No more than two live major versions at a time.** Three concurrent majors signal that breaking changes are too frequent. The fix is process (smaller releases, additive design), not more version slots.

- **Version the OpenAPI document, not the runtime binary.** The OpenAPI file's `info.version` matches the contract version; the build artifact version is independent and may carry build metadata.

- **Internal APIs may use date-based versions** (`/2024-08-15/orders`) for finer-grained evolution; this is a deliberate choice recorded in the INTAKE `Stack/Style:` field or the PLAN `Conventions:` block, not a default.

### Pagination

- **Cursor-based pagination is the default for any list that may grow between requests.** The response carries `next_cursor` (opaque string, not the offset or the page number) and `has_more` (boolean). The client passes `cursor=...` on the next request. Cursors are stable across inserts; offsets are not.

- **Page-based pagination (`?page=N&size=M`)** is acceptable only when the dataset is small, bounded, and administrative (admin dashboards, reports). The response carries `page`, `size`, `total`. Never expose `total` on a large or unbounded collection -- the count query is a denial-of-service vector.

- **Limit + offset (`?limit=N&offset=M`)** is acceptable for export and bulk-processing endpoints where the client controls iteration, but the maximum `limit` is server-capped and the offset is bounded (typically `offset + limit <= 10_000`). Beyond the bound, return `400` and instruct the client to switch to cursor pagination.

- **Default page size, maximum page size, and the cap behavior are documented per endpoint.** The server enforces the cap silently (clamp and return the smaller page) or loudly (`400`) depending on the endpoint's contract.

- **Response envelope for paginated lists.** Wrap the list under a named key (`"data": [...]` or `"items": [...]`) so the response can carry pagination metadata alongside the items. A bare top-level array is a contract defect: it cannot evolve to add metadata without breaking every client.

### Idempotency

- Mutating endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) accept an `Idempotency-Key` header. The server stores `(key, request-fingerprint, response)` for at least 24 hours.

- **A duplicate request with the same key and the same fingerprint replays the stored response.** The status code and body are identical to the original; side effects do not re-execute.

- **A duplicate request with the same key but a different fingerprint returns `422`** (or `409`) with an `idempotency_conflict` error code. The client's intent diverged; the server must not guess which request wins.

- **A request without a key on a mutating endpoint is processed once** but is not safe to retry. The contract documents which endpoints require the key for safety (payment, order creation, webhook delivery) versus which treat it as a best-effort optimization.

- **Idempotency keys are not authentication.** The server does not trust the key alone; the request still requires a valid session/token. Keys are scoped per principal (tenant + user) so two unrelated clients cannot collide on a UUID.

### Rate limiting

- **Per-principal limits** (API key, user, tenant), not per-IP. IP-based limits are a fallback for unauthenticated endpoints and an abuse signal, never the primary control.

- **Standard response headers** on every rate-limited endpoint: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds until the window resets). The legacy `X-RateLimit-*` headers are emitted only when the client requests them via `Prefer: x-ratelimit-legacy` or when a documented compatibility window requires them.

- **Rejection response.** `429 Too Many Requests` with a `Retry-After` header (seconds) and the same RFC 7807 error body (`type: "https://api.example.com/errors/rate_limited"`). The response is cacheable for the duration of `Retry-After`; intermediaries may coalesce.

- **Multiple limits coexist.** Cheap endpoints (reads) have a high quota; expensive endpoints (search, export) have a low quota. Limits are documented per endpoint class, not per endpoint.

- **Burst vs sustained.** A token-bucket or sliding-window design is acceptable; a fixed-window design (counter resets at the top of the hour) creates the thundering-herd problem at window boundaries. Document the algorithm when it affects client behavior.

- **Internal services are not exempt by default.** Internal callers are subject to limits with a higher quota; the quota and the auth path are the same code path, just parameterized. The "internal network is trusted" assumption is a H4 finding when an endpoint mutates sensitive data without authn or limits.

- **Rate-limit state is not stored in the database.** The store is in-memory (with TTL) or a fast external store (Redis, Cloudflare KV, Workers Rate Limiting binding). A database round-trip per request for rate-limit state is a performance and availability bug.

### Caching

- **`Cache-Control` on every GET response.** `no-store` for authenticated, user-specific, or real-time data; `private, max-age=N` for user-specific data the client may cache; `public, max-age=N` for shared data the CDN may cache. `must-revalidate` is the default when in doubt.

- **`ETag` and conditional requests.** Every GET response carries an `ETag` (opaque, derived from the resource version). Clients send `If-None-Match` on subsequent reads; the server returns `304 Not Modified` with no body when the version matches. The `ETag` is invalidated on every write to the resource.

- **Mutating endpoints set `Cache-Control: no-store`.** A `POST` response is never cached by intermediaries; a `204` from a `DELETE` is not cached; a `200` from a `PATCH` is not cached.

- **`Vary` header** for any endpoint whose response depends on `Accept`, `Accept-Encoding`, `Accept-Language`, or `Authorization`. Missing `Vary` is a cache-poisoning risk when the same URL produces different bodies for different clients.

- **Cache keys are not just URLs.** They include the relevant request headers (`Vary`), the authenticated principal (when the response is user-specific), and the API version. CDN misconfiguration that caches one tenant's response under another tenant's key is a hard-tier H4 finding.

### Authentication and authorization at the edge

- **Authentication happens before authorization.** Every endpoint requires a known identity except those explicitly documented as public (`/health`, `/.well-known/...`, `/openapi.json` for some deployments).

- **Authorization is per-resource, not per-route.** A route is a container; the resource instance is what the policy decides on. A user who can read their own `/orders/{id}` cannot read someone else's `/orders/{id}` even though the route is the same. The check is `policy(user, resource)`, not `policy(user, route)`.

- **Bearer tokens are validated at the edge** (gateway, middleware). The downstream handler trusts the principal identity passed via a trusted header or context object set by the edge. The handler does not re-parse the token.

- **OAuth scopes and API keys are checked at the route level.** The required scope is declared in the OpenAPI document and enforced by middleware; the handler receives an already-authorized principal.

- **Service-to-service auth uses mTLS or signed tokens** (JWT with a short expiry, rotated keys). A shared static API key between two internal services is a H3 finding when the key is committed, and a H4 finding when the key is the only auth check on a mutating endpoint.

- **PII and secrets are not echoed back.** A successful `POST /users` does not return the password hash, the session token, or any field the client did not send. The response is a projection, not the stored row.

### OpenAPI governance

- **The OpenAPI document is the source of truth.** A change to a contract without a matching change to the OpenAPI document is a contract drift; the document and the code never silently disagree. The contract version in the document matches the URI version (`info.version: "1.4.2"` for `/v1/...`).

- **Generate, do not hand-author.** Use a code-first generator (`zod-to-openapi`, `tsoa`, `fastapi`, `springdoc`, `swag`) so the document tracks the code. Hand-authored OpenAPI drifts; generated OpenAPI is the same as the code, modulo generator bugs.

- **Lint the OpenAPI document.** Spectral or a project-equivalent linter runs in CI and on pre-commit when the document is in scope. The lint ruleset covers: required fields per operation, consistent error responses, parameter naming, schema reuse via `components/schemas`, and no undocumented status codes.

- **Examples in the document.** Every schema carries an `example`; every operation has a `requestBody.example` and at least one success and one error `response.example`. Documents without examples are a S9/S10 finding.

- **`$ref` everywhere.** Reusable schemas live in `components/schemas`; reusable parameters and responses live in `components/parameters` and `components/responses`. Inline duplication of a schema is a soft-tier finding.

- **Breaking changes between versions** require a parallel document tree (`openapi.v1.yaml`, `openapi.v2.yaml`) until the previous version is sunset. A single document with `oneOf` branches per version is not a versioning strategy; it is a maintenance trap.

- **Public APIs publish the document.** Internal-only APIs may keep the document in the repo; public APIs serve it at `/openapi.json` (or `/openapi.yaml`) on the running service so clients can discover it.

### REVIEW rule (API)

During REVIEW, flag the following:

- **No OpenAPI document for a service with more than one consumer** (S9/S10): a service whose contract is invisible to clients is unmaintainable.

- **OpenAPI document out of sync with code** (H4-adjacent): response shape, status codes, or required fields diverge from the running service. Compare the document against a representative handler in each batch.

- **Inconsistent error shape across endpoints** (H7): some endpoints return `{error: "..."}`, others return `{message: "..."}`, others return RFC 7807. The contract must be uniform.

- **Status code misuse** (H6-adjacent): `200` for a failure, `500` for a client error, `404` for an authorization failure that should be `403` to avoid information disclosure.

- **No `Idempotency-Key` on a mutating endpoint that is retried** (H9-adjacent): a payment or order endpoint that can be replayed and double-charged is a data-integrity bug.

- **No rate limiting on a public endpoint** (H4-adjacent): an unauthenticated or weakly-authenticated endpoint without a quota is a denial-of-service vector. The exclusion requires justification recorded in the REVIEW decision section.

- **Missing or wrong `Cache-Control` / `ETag` / `Vary`** on a GET endpoint (S12-adjacent, H4 on multi-tenant): cache poisoning or data leakage between tenants is a hard-tier finding when the response varies by principal and the cache key does not.

- **PII, secret, or internal path in an error response** (H7): the same rule as the database section; the error handler is the boundary.

- **Path-versioned API with three or more live major versions** (S13): signal of breaking-change frequency, not a versioning strategy.

- **Deeply nested resource paths** (more than one level): refactor to top-level resource with a query parameter or a sub-resource at one level of nesting only.

### PLAN rule (API)

When a plan introduces or modifies an API surface, the plan must include:

- The endpoint(s) added, changed, or removed, with method, path, and a one-line intent.

- The OpenAPI document update path (regenerate from code, or hand-edit the document, with a justification for hand-editing).

- The authn/authz shape: required auth, required scope or role, and the resource-level policy decision (which fields the principal may read/write).

- The error response shape, citing the canonical error document and the per-endpoint error codes.

- The idempotency posture: which endpoints require `Idempotency-Key`, what the server stores, and the retention window.

- The rate-limit posture: per-principal limits, the algorithm, the response headers, and the storage layer.

- The pagination posture: cursor / page / limit-offset, with the documented cap.

- The caching posture: `Cache-Control`, `ETag`, `Vary`, and the cache key composition.

- A version-impact statement: breaking or non-breaking, with the rationale, and the version bump if breaking.

- A cross-team requirement entry in `CHANGES_REQUIRED.md` when the change affects consumers in another repo.

A plan that touches the API without addressing each of the above is incomplete; the PLAN acceptance gate surfaces the gap.

### API contract governance

When emitting a patch that adds or modifies an API surface:

- The patch includes the OpenAPI document update alongside the code change in the same commit; the two are never split across commits.

- The patch uses the code-first generator (or its project-equivalent) when one is established; hand-edits to the document require a `# TODO(owner): regenerate on next build` comment with the generator command.

- The patch never introduces a new error shape; new error codes extend the canonical `errors[]` array or the canonical `type` URI set, both of which are stable per the versioning rules.

- The patch never removes an endpoint or a field without a deprecation cycle: a `Deprecation` and `Sunset` header on the old path, and the new path documented in the OpenAPI document. Removal without a deprecation cycle is a breaking change without a version bump and a hard-tier H4 finding.

- The patch adds the test that exercises the contract: a contract test for each new endpoint (request shape, response shape, status codes, error codes) and an integration test that runs the actual handler against an in-memory or test-server instance. A new endpoint without a contract test is a S9 finding.

- The patch records a `CHANGES_REQUIRED.md` entry when the change crosses a team boundary, per `prompt-system/07-protocols.md` `## Cross-team requirements`.

### Cross-team requirements (API)

API changes are the canonical cross-team trigger. A field rename, a new required field, a status code change, or a rate-limit reduction in the upstream service forces consumer updates. The cross-team protocol applies:

- The finding is tagged `[cross-team]` in REVIEW.

- A `CHANGES_REQUIRED.md` entry is filed with the contract before/after, the affected consumer repos, and the migration deadline (matching the `Sunset` header).

- The plan states whether the current repo's change is gated on the consumer update or ships independently. When gated, the relevant plan steps are marked `BLOCKED pending cross-team`.
