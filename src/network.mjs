import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20000;

export function publicHttpsUrl(value) {
    if (typeof value !== 'string' || value.length > 8192) {
        throw new TypeError('URL must be a string of at most 8192 characters');
    }
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password ||
        (url.port && url.port !== '443')) {
        throw new TypeError('Only public HTTPS URLs on port 443 without credentials are supported');
    }
    url.hash = '';
    return url;
}

export function isPublicAddress(address) {
    try {
        if (address.includes('%')) return false;
        const parsed = ipaddr.process(address);
        if (parsed.range() !== 'unicast') return false;
        // Restrict IPv6 to global unicast in addition to library exclusions.
        return parsed.kind() === 'ipv4' || parsed.match(ipaddr.parse('2000::'), 3);
    } catch {
        return false;
    }
}

export async function resolvePublicAddress(url, lookupFn = lookup) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const answers = ipaddr.isValid(hostname)
        ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6 }]
        : await lookupFn(hostname, { all: true, verbatim: true });
    if (!answers.length || answers.some(answer => !isPublicAddress(answer.address))) {
        throw new Error('Destination does not resolve exclusively to public addresses');
    }
    const selected = answers[0];
    // Derive family from the address rather than trusting a DNS adapter.
    return {
        address: selected.address,
        family: ipaddr.parse(selected.address).kind() === 'ipv4' ? 4 : 6,
    };
}

function requestOnce(url, address) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let response;
        let timer;
        const finish = (error, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) {
                response?.destroy();
                request.destroy();
                reject(error);
            } else {
                resolve(value);
            }
        };
        const request = https.request(url, {
            method: 'GET',
            agent: false,
            headers: {
                Accept: 'text/html,application/xhtml+xml,application/pdf',
                'Accept-Encoding': 'identity',
                'User-Agent': 'DocumentToLLMMarkdown/1.0',
            },
            // Pin the validated address while retaining hostname TLS verification.
            lookup: (_hostname, options, callback) => {
                if (options?.all) callback(null, [address]);
                else callback(null, address.address, address.family);
            },
        }, incoming => {
            response = incoming;
            incoming.on('error', error => finish(error));
            incoming.on('aborted', () => finish(new Error('Download was interrupted')));
            const status = incoming.statusCode;
            if ([301, 302, 303, 307, 308].includes(status)) {
                const location = incoming.headers.location;
                finish(null, { location, redirect: true });
                incoming.destroy();
                return;
            }
            if (status !== 200) {
                finish(new Error(`Source returned HTTP ${status}`));
                return;
            }
            const encoding = incoming.headers['content-encoding'];
            if (encoding && encoding.toLowerCase() !== 'identity') {
                finish(new Error('Compressed responses are not supported'));
                return;
            }
            const declared = Number(incoming.headers['content-length']);
            if (Number.isFinite(declared) && declared > MAX_DOWNLOAD_BYTES) {
                finish(new Error('Document exceeds the 10 MiB download limit'));
                return;
            }
            let size = 0;
            const chunks = [];
            incoming.on('data', chunk => {
                if (settled) return;
                size += chunk.length;
                if (size > MAX_DOWNLOAD_BYTES) {
                    finish(new Error('Document exceeds the 10 MiB download limit'));
                } else {
                    chunks.push(chunk);
                }
            });
            incoming.on('end', () => finish(null, {
                bytes: Buffer.concat(chunks),
                contentType: String(incoming.headers['content-type'] || '').split(';')[0].trim().toLowerCase(),
            }));
        });
        request.on('error', error => finish(error));
        timer = setTimeout(() => finish(new Error('Download exceeded its time limit')), TIMEOUT_MS);
        request.end();
    });
}

/** No browser, cookies, credentials or environment-proxy forwarding. */
export async function fetchPublicDocument(value) {
    let url = publicHttpsUrl(value);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
        // Every hop is independently validated and pinned before connection.
        const address = await resolvePublicAddress(url);
        const result = await requestOnce(url, address);
        if (!result.redirect) return { ...result, finalUrl: url.href };
        if (!result.location) throw new Error('Redirect has no Location header');
        if (redirects === MAX_REDIRECTS) throw new Error('Too many redirects');
        url = publicHttpsUrl(new URL(result.location, url).href);
    }
    throw new Error('Too many redirects');
}
