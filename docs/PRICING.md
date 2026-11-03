# Pay-per-event pricing

This document describes the pay-per-event configuration and the charging sequence implemented in the code.

## Events

| Event name | Unit price | Trigger |
| --- | --- | --- |
| `document-processed` | USD 0.005 | One successful HTML or PDF extraction after its output is saved. |
| `pdf-page-processed` | USD 0.001 | Each page of a successfully extracted PDF, after the document charge. |

Use `document-processed` as the primary event. Names must exactly match the Actor's Console pricing configuration; `Actor.charge` supplies names and counts, not USD prices.

A PDF with N pages has an event total of `0.005 + 0.001 * N` USD. For example, three pages cost USD 0.008. An HTML document costs USD 0.005.

PDF pages are billed according to the extracted document's page count, including empty pages and pages with output removed by `maxChars`. All pages are processed before output truncation. Successful empty-text extraction remains billable; warnings explain missing embedded text and the absence of OCR. Downloads or extractions that fail have no custom processing charge.

## Console setup

1. Select the pay-per-event model and define the two custom events above.
2. Set `document-processed` as the primary event and configure the unit prices. Review any discount tiers separately.
3. Disable synthetic `apify-actor-start` and `apify-default-dataset-item` charges to match the advertised event totals. Error rows also use the default dataset, so an enabled synthetic dataset event can charge for them.
4. Keep additional platform-usage charging disabled if advertising event-only totals.
5. Test actual pricing and spending-limit behavior in a controlled platform run before publication.

The code does not apply these Console settings. The live pricing configuration controls actual billing.

## Save and charge sequence

The implementation follows Apify's guidance to save accessible results before charging for them:

1. Download and extract one document.
2. Save the complete bounded result with `Actor.pushData(record)`, without an event name.
3. Call `Actor.charge({ eventName: 'document-processed', count: 1 })`.
4. Inspect `chargedCount` and `eventChargeLimitReached`. Stop if the charge was underfulfilled or its limit was reached.
5. For PDF, request `pdf-page-processed` with `count: pageCount`. Inspect the returned count and limit flag, then stop if necessary.
6. Process the next URL only if the previous storage and charging sequence completed without a stop condition.

The maximum page batch is 200, matching the PDF processing limit. Pages have already been extracted and their output saved when this batch is charged. A partial page charge therefore leaves accessible output for more pages than were billed; it never causes the code to hide already saved pages.

## Spending limits and partial charges

Apify can charge fewer events than requested to respect the user's run budget. The implementation uses the actual `chargedCount`; it does not assume a requested batch was fully charged.

The document and PDF-page charges are separate operations and are not atomic. Possible outcomes include:

- Output saved, zero document events charged: stop with output retained and no page charge attempted.
- Document charged and its event limit reached: stop before requesting page charges. This is conservative even if a cheaper event might still fit.
- Document charged, some PDF pages charged: retain all saved page output and stop.
- All requested events charged, event limit reached: stop before the next document.

`eventChargeLimitReached` applies to the current event type. The SDK also exposes `chargeableWithinLimit` for cross-event decisions; this implementation stops conservatively instead of using it to continue with cheaper events.

Because saving precedes charging, abrupt termination between those operations can leave uncharged output. Conversely, storage success followed by a charging failure can leave an unknown charge outcome. There is no transaction spanning dataset writes and both custom events.

## Failures and reruns

- Download or extraction failure: save a generic error item, skip custom charges and continue.
- Dataset write failure: stop; no custom charge is attempted for that item.
- Charging exception or malformed charge response: stop without an application-level retry. A saved successful item may already have been charged.

The SDK can perform its own internal request handling. The application does not wrap charge calls in a retry loop or promise exactly-once processing.

There is no persistent resume ledger across migrations, crashes or new runs. Input deduplication applies only within the current processing invocation. Restarting or rerunning can process, save and charge a document again. Inspect platform charge records before retrying a run with an uncertain outcome. Dataset rows do not contain final billing receipts.

## Developer economics

Apify's retrieved PPE documentation states:

`profit = (0.8 * revenue) - platform costs`

At the listed prices, revenue after the 20% share and before platform costs is USD 0.004 per document plus USD 0.0008 per PDF page. These figures are arithmetic illustrations, not measured margins. The documentation excludes free-plan users from the developer profit calculation.

No runtime cost benchmark or profitability validation has been performed. Measure memory, duration, failures, empty-output documents and partial-budget runs before finalizing prices. The current Actor processes documents sequentially and sets bounded downloads and PDF limits.

## Validation evidence

Ten offline billing tests passed using a fake Actor. They cover save-before-charge ordering, all-page accounting, storage failure, zero and partial charges, conservative budget stops, uncertain charge exceptions, malformed responses and invalid records. Four run-loop tests passed and cover continued processing after extraction errors and stopping after budget, storage or charging failures.

These tests verify application decisions. They do not validate real SDK charging, Console configuration, platform abort timing or commercial profitability.

## Official sources

Retrieved with curl during implementation:

- [Pay-per-event pricing](https://docs.apify.com/platform/actors/publishing/monetize/pay-per-event): events, synthetic charges, save-before-charge guidance, limits and profit calculation.
- [Actor SDK](https://docs.apify.com/sdk/js/reference/class/Actor): dataset writes and explicit charging.
- [ChargeOptions](https://docs.apify.com/sdk/js/reference/interface/ChargeOptions.md): `eventName` and `count`.
- [ChargeResult](https://docs.apify.com/sdk/js/reference/interface/ChargeResult.md): `chargedCount`, `eventChargeLimitReached` and `chargeableWithinLimit`.
