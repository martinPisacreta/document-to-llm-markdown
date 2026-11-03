export const DOCUMENT_EVENT = 'document-processed';
export const PDF_PAGE_EVENT = 'pdf-page-processed';

function validateChargeResult(result, requested) {
    if (!result || !Number.isInteger(result.chargedCount) ||
        result.chargedCount < 0 || result.chargedCount > requested ||
        typeof result.eventChargeLimitReached !== 'boolean') {
        throw new Error('Invalid charging response; stop without retrying the charge');
    }
    return result.chargedCount < requested || result.eventChargeLimitReached;
}

/**
 * Outside pay-per-event pricing (local runs, or before monetization is set up)
 * the SDK ignores charges and reports chargedCount 0 with no limit reached.
 * Treating that as an exhausted budget would stop after the first document.
 * Actors without pricing info (test doubles) are treated as billed.
 */
function isPayPerEvent(actor) {
    const info = actor.getChargingManager?.()?.getPricingInfo?.();
    return info ? info.isPayPerEvent === true : true;
}

/**
 * Save accessible output before charging, as required by Apify PPE guidance.
 * Storage and charging errors propagate: callers must stop the run rather
 * than retry this function or reinterpret billing errors as extraction errors.
 * Separate events are not transactional. If budget runs out, saved output
 * can exceed billed output; stop processing further documents in that case.
 */
export async function saveAndCharge(actor, record) {
    if (!record || record.status !== 'success') {
        throw new TypeError('Only successful document records can be billed');
    }
    const isPdf = record.documentType === 'pdf';
    if (!isPdf && record.documentType !== 'html') {
        throw new TypeError('Unsupported document type');
    }
    if (isPdf && (!Number.isInteger(record.pageCount) || record.pageCount < 1 ||
        record.pageCount > 200 || !Array.isArray(record.pages) ||
        record.pages.length !== record.pageCount)) {
        throw new TypeError('PDF records must retain every processed page');
    }

    // Do not pass an event name here: custom events are charged explicitly.
    // Disable synthetic dataset/start charges in Console for the stated price.
    await actor.pushData(record);
    if (!isPayPerEvent(actor)) {
        return { stop: false, documentEventsCharged: 0, pdfPageEventsCharged: 0 };
    }
    const documentCharge = await actor.charge({ eventName: DOCUMENT_EVENT, count: 1 });
    const stopAfterDocument = validateChargeResult(documentCharge, 1);
    const outcome = {
        stop: stopAfterDocument,
        documentEventsCharged: documentCharge.chargedCount,
        pdfPageEventsCharged: 0,
    };
    if (stopAfterDocument || !isPdf) return outcome;

    // Includes empty pages and pages whose output was truncated by maxChars.
    const pageCharge = await actor.charge({
        eventName: PDF_PAGE_EVENT, count: record.pageCount,
    });
    outcome.stop = validateChargeResult(pageCharge, record.pageCount);
    outcome.pdfPageEventsCharged = pageCharge.chargedCount;
    return outcome;
}
