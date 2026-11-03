import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAndCharge, DOCUMENT_EVENT, PDF_PAGE_EVENT } from '../src/billing.mjs';

const html = { status: 'success', documentType: 'html', content: 'Useful text' };
const pdf = {
    status: 'success', documentType: 'pdf', pageCount: 3,
    pages: [
        { pageNumber: 1, content: 'First' },
        { pageNumber: 2, content: '', textTruncated: true },
        { pageNumber: 3, content: '', textTruncated: false },
    ],
};

function fakeActor(results = []) {
    const calls = [];
    return {
        calls,
        async pushData(record) { calls.push({ method: 'pushData', record }); },
        async charge(options) {
            calls.push({ method: 'charge', options });
            if (!results.length) throw new Error('Unexpected charge');
            const result = results.shift();
            if (result instanceof Error) throw result;
            return result;
        },
    };
}
const charged = count => ({ chargedCount: count, eventChargeLimitReached: false });

test('HTML is saved before one document charge', async () => {
    const actor = fakeActor([charged(1)]);
    const result = await saveAndCharge(actor, html);
    assert.deepEqual(actor.calls, [
        { method: 'pushData', record: html },
        { method: 'charge', options: { eventName: DOCUMENT_EVENT, count: 1 } },
    ]);
    assert.deepEqual(result, { stop: false, documentEventsCharged: 1, pdfPageEventsCharged: 0 });
});

test('without pay-per-event pricing, output is saved and processing continues uncharged', async () => {
    const actor = fakeActor();
    actor.getChargingManager = () => ({ getPricingInfo: () => ({ isPayPerEvent: false }) });
    const result = await saveAndCharge(actor, pdf);
    assert.deepEqual(actor.calls, [{ method: 'pushData', record: pdf }]);
    assert.deepEqual(result, { stop: false, documentEventsCharged: 0, pdfPageEventsCharged: 0 });
});

test('PDF bills every processed page, including empty and truncated pages', async () => {
    const actor = fakeActor([charged(1), charged(3)]);
    const result = await saveAndCharge(actor, pdf);
    assert.equal(actor.calls[0].method, 'pushData');
    assert.deepEqual(actor.calls.slice(1).map(call => call.options), [
        { eventName: DOCUMENT_EVENT, count: 1 },
        { eventName: PDF_PAGE_EVENT, count: 3 },
    ]);
    assert.deepEqual(result, { stop: false, documentEventsCharged: 1, pdfPageEventsCharged: 3 });
});

test('storage failure prevents every charge', async () => {
    const actor = fakeActor([charged(1)]);
    actor.pushData = async () => { throw new Error('Storage unavailable'); };
    await assert.rejects(saveAndCharge(actor, html), /Storage unavailable/);
    assert.deepEqual(actor.calls, []);
});

test('zero document charges stops without attempting PDF page charges', async () => {
    const actor = fakeActor([{ chargedCount: 0, eventChargeLimitReached: true }]);
    const result = await saveAndCharge(actor, pdf);
    assert.equal(result.stop, true);
    assert.equal(result.documentEventsCharged, 0);
    assert.equal(actor.calls.length, 2);
});

test('reaching the document event limit stops conservatively', async () => {
    const actor = fakeActor([{ chargedCount: 1, eventChargeLimitReached: true }]);
    const result = await saveAndCharge(actor, pdf);
    assert.equal(result.stop, true);
    assert.equal(actor.calls.length, 2);
});

test('partial PDF charge retains actual chargedCount and stops', async () => {
    const actor = fakeActor([charged(1), { chargedCount: 2, eventChargeLimitReached: true }]);
    const result = await saveAndCharge(actor, pdf);
    assert.equal(result.stop, true);
    assert.equal(result.pdfPageEventsCharged, 2);
    assert.equal(actor.calls.length, 3);
});

test('underfulfilled charges stop even if limit flag is false', async () => {
    const actor = fakeActor([charged(1), charged(1)]);
    assert.equal((await saveAndCharge(actor, pdf)).stop, true);
});

test('charging failure propagates without retry or duplicate saved result', async () => {
    const actor = fakeActor([new Error('Charging outcome unknown')]);
    await assert.rejects(saveAndCharge(actor, html), /Charging outcome unknown/);
    assert.equal(actor.calls.length, 2);
});

test('malformed charging responses fail closed without another charge', async () => {
    for (const response of [undefined, {}, charged(-1), charged(2), charged(0.5), { chargedCount: 1 }]) {
        const actor = fakeActor([response]);
        await assert.rejects(saveAndCharge(actor, html), /Invalid charging response/);
        assert.equal(actor.calls.length, 2);
    }
});

test('failed or malformed extraction records cannot be saved or billed', async () => {
    for (const record of [
        null, { status: 'error', documentType: 'html' },
        { status: 'success', documentType: 'unknown' },
        { ...pdf, pageCount: 4 }, { ...pdf, pageCount: 0 },
    ]) {
        const actor = fakeActor();
        await assert.rejects(saveAndCharge(actor, record), TypeError);
        assert.deepEqual(actor.calls, []);
    }
});
