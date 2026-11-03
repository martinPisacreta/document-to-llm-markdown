import { saveAndCharge } from './billing.mjs';

/** Input is validated before entering this sequential processing loop. */
export async function runDocuments(actor, options, processDocument) {
    const summary = { successful: 0, failed: 0, stoppedForBudget: false };
    for (const url of options.urls) {
        let record;
        try {
            record = await processDocument(url, options);
        } catch {
            // Do not expose arbitrary remote response text or internal exception details.
            await actor.pushData({
                url, status: 'error',
                error: 'Document download or extraction failed. Check public accessibility, supported content type and processing limits.',
            });
            summary.failed++;
            continue;
        }
        // Storage and billing failures must escape this loop. Never retry them
        // as extraction failures, and never process another document afterward.
        const billing = await saveAndCharge(actor, record);
        summary.successful++;
        if (billing.stop) {
            summary.stoppedForBudget = true;
            break;
        }
    }
    return summary;
}
