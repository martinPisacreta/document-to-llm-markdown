# Document to LLM Markdown

Run it on Apify Store: https://apify.com/textokit/document-to-llm-markdown

Convert public HTTPS articles, documentation pages and text-based PDFs into Markdown or plain text for LLM workflows. Get extracted content, source URLs, character counts and explicit truncation warnings in the default Apify dataset.

Useful for developers building retrieval pipelines, research assistants, document indexing and summarization workflows. No external LLM API or API key is required.

## What it extracts

- HTML: page title and main article content, with navigation, scripts and common page furniture removed. Markdown preserves headings, links, lists and code blocks where extraction supports them.
- PDF: embedded text in page order, PDF title when available, page numbers and per-page character counts. Empty pages remain represented.
- Both: original extracted-content length, returned-content length, truncation status and warnings. Counts use Unicode code points.

PDF output contains page text in both formats; it does not reconstruct rich Markdown layout.

## Input

For one document:

```json
{
  "url": "https://example.com/article",
  "format": "markdown",
  "maxChars": 20000
}
```

For a batch:

```json
{
  "urls": [
    "https://example.com/article",
    "https://example.com/report.pdf"
  ],
  "format": "text",
  "maxChars": 50000
}
```

These URLs illustrate the input shape; replace them with your documents.

| Field | Meaning |
| --- | --- |
| `url` | One public HTTPS document URL. |
| `urls` | Between 1 and 50 public HTTPS document URLs. |
| `format` | `markdown` (default) or `text`. |
| `maxChars` | Between 1 and 200000; default 20000. Applies separately to each document. |

Provide exactly one of `url` or `urls`. Runtime validation enforces this rule for API and Console inputs. URL fragments are removed and identical normalized input URLs are processed once per run. Different URLs that redirect to the same document can still be processed separately.

The character budget covers returned content, including Markdown syntax, and excludes titles and metadata. A PDF shares one budget across all pages. Pages remain in the output after the budget is exhausted, with empty content and truncation metadata when applicable. Truncating output does not reduce PDF processing or page charges.

## Output

Each successfully extracted document produces one dataset item. This illustrative HTML result shows the output shape:

```json
{
  "url": "https://example.com/article",
  "finalUrl": "https://example.com/article",
  "status": "success",
  "documentType": "html",
  "format": "text",
  "title": "Example document",
  "fullTextCharacters": 12,
  "outputCharacters": 12,
  "textTruncated": false,
  "warnings": [],
  "content": "Hello world."
}
```

PDF items replace the document-level `content` field with `pageCount` and a `pages` array. Each page contains `pageNumber`, `content`, `fullTextCharacters`, `outputCharacters` and `textTruncated`. Document-level counts sum page content without adding separators.

Download or extraction failures produce an error item and no custom processing charges. The run continues with the next URL. Storage or charging failures stop the run; previously saved results remain subject to platform retention. Dataset items do not certify that their corresponding charges completed.

## Pricing

Pay per event: **USD 0.005 per successfully extracted document, plus USD 0.001 per processed PDF page.** You pay only for documents that were extracted.

| Document | Total |
| --- | --- |
| One HTML page | USD 0.005 |
| Three-page PDF | USD 0.008 |
| Ten-page PDF | USD 0.015 |

PDF page charges include empty pages and pages whose returned text is truncated. A successful extraction with no embedded text is still billable and includes a warning. Failed downloads and failed extractions are not charged. The pricing shown on the Apify Store page is the one that applies; event names and the charging sequence are described in [docs/PRICING.md](docs/PRICING.md).

## Supported documents and limits

- Public HTTPS destinations on port 443, without URL credentials. Private and special-use IP destinations are rejected. Every redirect is independently checked and its resolved address pinned for connection.
- Static HTML and text-based PDFs; no JavaScript rendering, authentication, cookies, proxy configuration or OCR.
- Maximum download size: 10 MiB per document. Compressed HTTP responses are rejected.
- Up to five redirects. Each HTTP request has a 20-second deadline; DNS resolution is outside that deadline.
- Maximum PDF length: 200 pages; maximum accumulated extracted PDF text: 2000000 Unicode code points. Exceeding either limit fails that document.
- HTML is decoded as UTF-8. Other character encodings can produce incorrect text.
- Main-content detection is heuristic. Short or unusual pages can use cleaned-page fallback content; extraction quality varies with the source.
- PDF reading order depends on embedded text. Complex columns, tables, scanned pages and font encoding can reduce quality.

## Development

Source, tests and the validation record are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Run `npm ci` and `npm test`; tests use local fixtures only.

## Implementation and official references

`src/main.js` uses the official Apify SDK lifecycle and connects validation, download, extraction, output storage and explicit custom-event charging, with a document-wide Unicode budget and page metadata.

Official Apify documentation used:

- [Actor SDK reference](https://docs.apify.com/sdk/js/reference/class/Actor): `Actor.init`, `Actor.getInput`, `Actor.pushData`, `Actor.charge` and `Actor.exit`.
- [ChargeOptions](https://docs.apify.com/sdk/js/reference/interface/ChargeOptions.md): event names and counts.
- [ChargeResult](https://docs.apify.com/sdk/js/reference/interface/ChargeResult.md): actual charged counts and event-specific spending limits.
- [Pay-per-event pricing](https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event): saving results before charging, custom and synthetic events, spending limits and developer revenue.
- [Actor definition](https://docs.apify.com/platform/actors/development/actor-definition/actor-json): Actor metadata and paths relative to `.actor/`.
- [Input schema](https://docs.apify.com/platform/actors/development/actor-definition/input-schema): Console input configuration.

## License

MIT. See [LICENSE](LICENSE).
