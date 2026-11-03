# Development and validation

## Requirements

Node.js `^22.22.2` or `^24.15.0` (the jsdom 30 engine range), npm 9 or newer. The Docker build uses `apify/actor-node:22-slim` and `npm ci --omit=dev`, keeping optional dependencies so PDF.js can load `@napi-rs/canvas` when available.

Direct dependencies, pinned in `package.json` and resolved in `package-lock.json` (228 packages, about 189 MB in `node_modules` on Linux x64):

| Package | Version | Purpose |
| --- | --- | --- |
| `apify` | `3.7.2` | Actor lifecycle, dataset storage and event billing |
| `jsdom` | `30.1.3` | Static HTML DOM |
| `@mozilla/readability` | `0.6.0` | Main article detection |
| `turndown` | `7.2.4` | HTML to Markdown conversion |
| `pdfjs-dist` | `6.5.438` | Embedded PDF text extraction |
| `ipaddr.js` | `2.5.0` | Destination IP classification |

## Tests

```sh
npm ci
npm test
```

All tests use local fixtures or injected functions and make no network requests. Billing tests use a fake Actor and perform no real charges.

## Validation record (2026-11-03, Ubuntu 24.04 on WSL2, Node 22.23.3, npm 10.9.9)

- `npm ci`: 229 packages added, no install errors.
- `node --test`: 39 of 39 passed (content, billing, processing, run loop, HTML, PDF, input and destination policy).
- Fixes found during validation: Markdown lists now use compact `- item` and `1. item` markers instead of Turndown's padded default; outside pay-per-event pricing (local runs, or before monetization is configured) the SDK reports `chargedCount: 0`, which the run loop had treated as an exhausted budget and stopped after the first document. Both have regression tests. A failed run now logs the error name and message.
- Local end-to-end run with the Apify SDK local storage (`CRAWLEE_STORAGE_DIR`): `https://example.com/` and a one-page public PDF (`https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`) were both extracted successfully; the PDF page text was `Dummy PDF file`. An `http://` URL in the input is rejected before any download or charge and fails the run with an input error.

Still unvalidated: Docker build on the Apify platform, Console acceptance of the input schema, real pay-per-event charges and the pricing configuration described in `docs/PRICING.md`.
