# MuzaLife Backend — Documentation Guide

This document explains **how documentation is written**, **which tools are used**, and **how to regenerate the HTML reference** from source code.

---

## Documentation standard

The backend is written in Node.js / ES Modules.  All public modules use **JSDoc 3** comments.

### What must be documented

| Artifact | Required tags |
|---|---|
| Module / file | `@fileoverview`, `@module` |
| Exported function / const | `@param`, `@returns`, `@throws`, `@example` |
| Class | `@class` + description |
| Public class method | `@param`, `@returns`, `@example` |
| Constants / singletons | `@type` |
| Architectural decisions | prose in `@fileoverview` |
| Business logic rules | prose in the function description body |

### What to document inside a comment

A good JSDoc comment answers three questions:

1. **What** does this do? (one-sentence summary)
2. **Why** does it exist? (architectural or business reason, especially if non-obvious)
3. **How** is it used? (`@example` block)

Example of a well-documented function:

```js
/**
 * Signs a new JWT that encodes a `userId` claim.
 *
 * Business rule: only `userId` is embedded in the token — all other user
 * attributes are fetched on each request to avoid stale data.
 *
 * @param {number} userId - The numeric primary key of the authenticated user.
 * @returns {string}       A signed JWT string.
 *
 * @example
 * const token = generateToken(user.user_id);
 * res.json({ token });
 */
export const generateToken = (userId) => { ... };
```

---

## Tools

### JSDoc 3

**JSDoc** reads JS source files and produces an HTML reference from `/** ... */` comments.

- Config: `jsdoc.json` in the project root
- Output: `docs/jsdoc/`

### eslint-plugin-jsdoc

Enforces JSDoc completeness and correctness via ESLint rules configured in `eslint.config.js`.  Key rules:

| Rule | Level |
|---|---|
| `jsdoc/require-jsdoc` | warn |
| `jsdoc/require-param` | warn |
| `jsdoc/require-returns` | warn |
| `jsdoc/valid-types` | warn |

Run the linter to see documentation gaps:

```bash
npm run lint
```

---

## Regenerating the documentation

### Prerequisites

```bash
# Node.js 16+ must be installed
node --version

# Install dev dependencies (includes jsdoc)
npm install
```

### Generate HTML docs

```bash
npm run docs
```

The HTML output is written to `docs/jsdoc/`.  Open `docs/jsdoc/index.html` in a browser to browse the reference.

### Clean and regenerate

```bash
npm run docs:clean
```

### Check documentation quality

```bash
npm run lint
```

JSDoc-related warnings indicate missing or incorrect documentation.

---

## Docs folder layout

```
docs/
├── generate_docs.md   ← this file
├── linting.md         ← ESLint & code-quality guide
├── api/               ← OpenAPI / Swagger spec (see api/ folder)
└── jsdoc/             ← Generated HTML reference (git-ignored)
```

---

## Keeping documentation up-to-date

Documentation is **not a one-time task**.  The following rules apply to all contributors:

- When you **add** a new exported function / class / module → add the full JSDoc block.
- When you **change** a function signature → update `@param` / `@returns` tags.
- When you **change business logic** → update the description or add a note.
- Before opening a PR → run `npm run lint` and fix all JSDoc warnings.
- The CI pipeline runs `npm run lint` — a build with JSDoc errors will fail.

---

## Swagger / OpenAPI documentation

The REST API is described in OpenAPI 3.0 format.  See [`docs/api/`](./api/) for the spec files and interactive Swagger UI setup instructions.
