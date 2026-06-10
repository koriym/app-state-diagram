# ADR 0003: MCP Server in TypeScript CLI

## Status

Accepted (supersedes the MCP decision in ADR 0002)

## Context

ADR 0002 decided to keep the MCP server in the PHP version to avoid
rewriting working code. Since then, the TypeScript CLI has gained all the
building blocks an MCP server needs: parsing, external reference
resolution, DOT/SVG generation, and validation. The official
`@modelcontextprotocol/sdk` makes the protocol layer thin.

The CLI generates documents in one shot. AI agents need something
different: incremental, token-efficient access to the application state
model — "what transitions leave this state?", "show me only the cart
descriptors", "document this state" — without re-reading the whole
profile each time.

## Decision

Implement the MCP server in the TypeScript CLI (`asd --mcp`, stdio
transport) with tools for querying and modifying ALPS profiles:

- `alps_overview`, `alps_search`, `alps_descriptor` — incremental reading
- `alps_validate` — validation with README error codes (E001-, W001-)
- `alps_paths` — path enumeration over the state graph
- `alps_diagram` — DOT/SVG rendering
- `alps_set_doc` — documentation writing

### External Documentation Convention (alps-doc/)

Inline `doc` values keep profiles readable only while they stay short.
For rich documentation, the doc is stored in an external Markdown file
and linked via the ALPS `doc` element's `href` attribute:

```
profile.json
alps-doc/
├── ShoppingCart.md
└── Checkout.md
```

```json
"doc": { "href": "alps-doc/ShoppingCart.md", "format": "markdown" }
```

`alps_set_doc` decides the placement automatically (`placement: auto`):

| Condition | Placement |
|-----------|-----------|
| <= 200 chars, single line | inline |
| > 200 chars or multi-line | external `alps-doc/<id>.md` |
| descriptor already uses an alps-doc file | stays external (no churn) |

Explicit `placement: inline | external` overrides the heuristic. When
switching from external to inline, the old file is reported as orphaned
but never deleted.

### Implementation Notes

- SDK imported as `@modelcontextprotocol/sdk/server/mcp.js`: runtime
  resolves via the package `exports` map (CJS build), TypeScript types
  via `typesVersions`. Deep `dist/` paths do not resolve under
  `moduleResolution: node`.
- `alps_set_doc` edits the raw JSON (not the normalized parse) so the
  rest of the profile is preserved, including indentation style.
- Writing is JSON-only for now; XML write-back would reformat the whole
  document. Read tools support both formats.

## Consequences

- ALPS profiles become a queryable source of truth for AI agents, not
  just an input for document generation.
- The PHP `--mcp` is no longer the only MCP path; the TS version is the
  one maintained going forward.
- The `alps-doc/` convention enables rich per-descriptor documentation
  without bloating profiles. HTML output rendering of linked docs is
  future work.
