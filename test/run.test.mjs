import test from 'node:test';
import assert from 'node:assert/strict';
import { runDocuments } from '../src/run.mjs';

const options = { urls: ['https://example.com/a', 'https://example.com/b'], format: 'text', maxChars: 20 };
const record = url => ({ url, status: 'success', documentType: 'html', content: 'Useful text' });

function actorWith(charge) {
    const saved = [];
    const charges = [];
    return {
        saved, charges,
        async pushData(value) { saved.push(value); },
        async charge(value) {
            charges.push(value);
            return charge ? charge(value) : { chargedCount: 1, eventChargeLimitReached: false };
        },
    };
}

test('extraction failure saves an uncharged error and continues to the next URL', async () => {
    const actor = actorWith();
    const summary = await runDocuments(actor, options, async url => {
        if (url.endsWith('/a')) throw new Error('Private internal detail');
        return record(url);
    });
    assert.deepEqual(summary, { successful: 1, failed: 1, stoppedForBudget: false });
    assert.equal(actor.saved.length, 2);
    assert.equal(actor.saved[0].status, 'error');
    assert.doesNotMatch(JSON.stringify(actor.saved[0]), /Private internal detail/);
    assert.equal(actor.charges.length, 1);
});

test('budget exhaustion prevents fetching the next document', async () => {
    const actor = actorWith(() => ({ chargedCount: 1, eventChargeLimitReached: true }));
    const fetched = [];
    const summary = await runDocuments(actor, options, async url => { fetched.push(url); return record(url); });
    assert.deepEqual(fetched, [options.urls[0]]);
    assert.deepEqual(summary, { successful: 1, failed: 0, stoppedForBudget: true });
});

test('uncertain charging failure propagates without another fetch, charge or error row', async () => {
    const actor = actorWith(() => { throw new Error('Unknown charge outcome'); });
    const fetched = [];
    await assert.rejects(runDocuments(actor, options, async url => { fetched.push(url); return record(url); }), /Unknown charge outcome/);
    assert.equal(fetched.length, 1);
    assert.equal(actor.saved.length, 1);
    assert.equal(actor.saved[0].status, 'success');
    assert.equal(actor.charges.length, 1);
});

test('storage failure stops before charging or processing another document', async () => {
    const actor = actorWith();
    actor.pushData = async () => { throw new Error('Storage failed'); };
    let fetched = 0;
    await assert.rejects(runDocuments(actor, options, async url => { fetched++; return record(url); }), /Storage failed/);
    assert.equal(fetched, 1);
    assert.equal(actor.charges.length, 0);
});
