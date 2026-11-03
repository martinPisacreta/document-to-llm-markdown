import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHttpsUrl, isPublicAddress, resolvePublicAddress } from '../src/network.mjs';

 test('URL policy rejects credentials, other protocols and nonstandard ports', () => {
    for (const url of ['http://example.com', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://example.com:8443']) {
        assert.throws(() => publicHttpsUrl(url));
    }
    assert.equal(publicHttpsUrl('https://example.com/path#section').href, 'https://example.com/path');
});

test('private, local, mapped private and special-use addresses are rejected', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '::ffff:127.0.0.1', '2001:db8::1', 'fe80::1%eth0']) {
        assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('mixed public and private DNS answers reject the whole destination', async () => {
    const fakeLookup = async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 },
    ];
    await assert.rejects(resolvePublicAddress(publicHttpsUrl('https://example.com'), fakeLookup), /public addresses/);
});

test('validated DNS addresses are returned for connection pinning without a network call', async () => {
    const fakeLookup = async (hostname, options) => {
        assert.equal(hostname, 'example.com');
        assert.equal(options.all, true);
        return [{ address: '8.8.8.8', family: 4 }];
    };
    assert.deepEqual(await resolvePublicAddress(publicHttpsUrl('https://example.com'), fakeLookup), { address: '8.8.8.8', family: 4 });
});

test('private IP literals cannot bypass DNS validation', async () => {
    const unexpectedLookup = async () => { throw new Error('DNS must not run for a literal'); };
    await assert.rejects(resolvePublicAddress(publicHttpsUrl('https://127.0.0.1'), unexpectedLookup), /public addresses/);
    await assert.rejects(resolvePublicAddress(publicHttpsUrl('https://[::1]'), unexpectedLookup), /public addresses/);
});
