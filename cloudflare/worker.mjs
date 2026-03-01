/**
 * Cloudflare Worker router that can run fully standalone:
 * - Serves static app via ASSETS binding
 * - Implements API proxies directly at edge
 * - Mirrors Vercel rewrite behavior (/api/v1/* and /api/tv/*)
 *
 * Optional env fallback:
 * - ORIGIN_BASE_URL: when set, unknown routes can be proxied there.
 */

const API_V1_REWRITES = new Map([
    ['/api/v1/fuckyouuuu', '/api/fuckyouuuu'],
    ['/api/v1/fckyouuu1', '/api/fckyouuu1'],
    ['/api/v1/fckyouuu2', '/api/scanx'],
]);

const TV_UPSTREAM_BASE = 'https://www.tradingview.com/api/v1';
const AES_KEY_BYTES = new Uint8Array([
    0x4a, 0x9c, 0x2e, 0xf1, 0x83, 0xd7, 0x56, 0xbb,
    0x12, 0x7e, 0xa4, 0x38, 0xc5, 0x69, 0xf0, 0x1d,
    0xe8, 0x31, 0x5b, 0x97, 0x04, 0xac, 0x72, 0xdf,
    0x63, 0xb8, 0x1f, 0x45, 0xea, 0x06, 0x8d, 0xc4
]);

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
    'host',
    'connection',
    'content-length',
    'accept-encoding',
]);

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'transfer-encoding',
]);

let cachedDecryptKey = null;

function getNoStoreHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
    };
}

function createJsonResponse(status, data, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...getNoStoreHeaders(),
            ...extraHeaders
        }
    });
}

function createTextResponse(status, text, extraHeaders = {}) {
    return new Response(text, {
        status,
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            ...getNoStoreHeaders(),
            ...extraHeaders
        }
    });
}

function createOptionsResponse(allowMethods, allowHeaders = 'Content-Type') {
    return new Response(null, {
        status: 204,
        headers: {
            ...getNoStoreHeaders(),
            'Access-Control-Allow-Methods': allowMethods,
            'Access-Control-Allow-Headers': allowHeaders,
            'Allow': allowMethods.replace(/,\s*/g, ', ')
        }
    });
}

function createMethodNotAllowedResponse(allowMethods) {
    return new Response('Method Not Allowed', {
        status: 405,
        headers: {
            ...getNoStoreHeaders(),
            'Allow': allowMethods
        }
    });
}

function normalizeApiPath(url) {
    const mapped = API_V1_REWRITES.get(url.pathname);
    if (mapped) url.pathname = mapped;

    if (url.pathname.startsWith('/api/tv/')) {
        const tvPath = url.pathname.slice('/api/tv/'.length);
        url.pathname = '/api/tv';
        url.searchParams.set('tv_path', tvPath);
    }
}

function toUint8ArrayFromHex(hexStr) {
    const clean = String(hexStr || '').trim();
    if (!clean || clean.length % 2 !== 0) throw new Error('Invalid encrypted payload');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        out[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
    }
    return out;
}

function decodeBase64Url(value) {
    const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

async function getDecryptKey() {
    if (cachedDecryptKey) return cachedDecryptKey;
    cachedDecryptKey = await crypto.subtle.importKey(
        'raw',
        AES_KEY_BYTES,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );
    return cachedDecryptKey;
}

async function unsealHexPayload(hexStr) {
    const raw = toUint8ArrayFromHex(hexStr);
    if (raw.byteLength < 13) throw new Error('Encrypted payload too short');
    const iv = raw.slice(0, 12);
    const cipherPlusTag = raw.slice(12);
    const key = await getDecryptKey();
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherPlusTag);
    return new TextDecoder().decode(plainBuffer);
}

async function handleGoogleBatch(request, url, { encryptedPost }) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, POST, OPTIONS', 'Content-Type, x-app-entropy, x-rpc-ids');
    if (request.method !== 'GET' && request.method !== 'POST') return createMethodNotAllowedResponse('GET, POST');

    try {
        const isGet = request.method === 'GET';
        let decodedFReq = '';
        let rpcIds = '';

        if (isGet) {
            const encoded = url.searchParams.get('f_req');
            if (!encoded) return createJsonResponse(400, { error: 'Missing f_req' });
            decodedFReq = decodeBase64Url(encoded);
            rpcIds = url.searchParams.get('rpcids') || 'xh8wxf';
        } else if (encryptedPost) {
            const encrypted = await request.text();
            decodedFReq = await unsealHexPayload(encrypted);
            rpcIds = request.headers.get('x-app-entropy') || 'xh8wxf';
        } else {
            rpcIds = request.headers.get('x-rpc-ids') || 'xh8wxf';
            const contentType = request.headers.get('content-type') || '';
            if (contentType.includes('application/x-www-form-urlencoded')) {
                const formText = await request.text();
                decodedFReq = new URLSearchParams(formText).get('f.req') || '';
            } else if (contentType.includes('application/json')) {
                const body = await request.json();
                decodedFReq = body?.['f.req'] ?? '';
            } else {
                const text = await request.text();
                try {
                    const body = JSON.parse(text);
                    decodedFReq = body?.['f.req'] ?? '';
                } catch {
                    decodedFReq = text;
                }
            }
        }

        if (!decodedFReq) return createJsonResponse(400, { error: 'Missing f.req payload' });

        const rpc = String(rpcIds);
        const googleUrl = `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpc)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
        const upstream = await fetch(googleUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                'Origin': 'https://www.google.com',
                'Referer': 'https://www.google.com/finance/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: new URLSearchParams({ 'f.req': decodedFReq }).toString(),
        });

        const text = await upstream.text();
        if (!upstream.ok) return createTextResponse(upstream.status, text || `Upstream Error: ${upstream.status}`);
        return createTextResponse(200, text);
    } catch (error) {
        return createJsonResponse(500, { error: 'Proxy error', details: error?.message || 'Unknown error' });
    }
}

async function getEncryptedJsonBody(request, url) {
    if (request.method === 'GET') {
        const encoded = url.searchParams.get('f_req');
        if (!encoded) throw new Error('Missing f_req');
        return JSON.parse(decodeBase64Url(encoded));
    }

    const encrypted = await request.text();
    const plain = await unsealHexPayload(encrypted);
    return JSON.parse(plain);
}

async function handleStrikeProxy(request, url) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, POST, OPTIONS');
    if (request.method !== 'GET' && request.method !== 'POST') return createMethodNotAllowedResponse('GET, POST');

    try {
        const body = await getEncryptedJsonBody(request, url);
        const { fromStr, toStr, encoded, path } = body;
        const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
        const upstream = await fetch(strikeUrl, { headers: { Accept: 'application/json' } });
        const text = await upstream.text();

        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            }
        });
    } catch (error) {
        return createJsonResponse(500, { error: 'System Error', details: error?.message || 'Unknown error' });
    }
}

async function handleScanxProxy(request, url) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, POST, OPTIONS');
    if (request.method !== 'GET' && request.method !== 'POST') return createMethodNotAllowedResponse('GET, POST');

    try {
        const payload = await getEncryptedJsonBody(request, url);
        const upstream = await fetch('https://ow-static-scanx.dhan.co/staticscanx/company_filings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://ow-static-scanx.dhan.co',
                'Referer': 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        });
        const text = await upstream.text();

        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            }
        });
    } catch (error) {
        return createJsonResponse(500, { error: 'Failed to fetch filings', details: error?.message || 'Unknown error' });
    }
}

async function handleMobileScanx(request) {
    if (request.method === 'OPTIONS') return createOptionsResponse('POST, OPTIONS');
    if (request.method !== 'POST') return createMethodNotAllowedResponse('POST');

    try {
        const payload = await request.json();
        const upstream = await fetch('https://ow-static-scanx.dhan.co/staticscanx/company_filings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Origin': 'https://ow-static-scanx.dhan.co',
                'Referer': 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        });
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            }
        });
    } catch (error) {
        return createJsonResponse(500, { error: 'Failed to fetch filings', details: error?.message || 'Unknown error' });
    }
}

async function handleMobileStrike(request) {
    if (request.method === 'OPTIONS') return createOptionsResponse('POST, OPTIONS');
    if (request.method !== 'POST') return createMethodNotAllowedResponse('POST');

    try {
        const body = await request.json();
        const { fromStr, toStr, encoded, path } = body;
        const strikeUrl = `https://api-v2.strike.money${path}?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
        const upstream = await fetch(strikeUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8'
            }
        });
    } catch (error) {
        return createJsonResponse(500, { error: 'Proxy error', details: error?.message || 'Unknown error' });
    }
}

function buildTradingViewCookie(request) {
    const existingCookie = request.headers.get('cookie');
    const sessionId = request.headers.get('x-tv-sessionid');
    const sessionSign = request.headers.get('x-tv-sessionid-sign');
    const parts = [];
    if (existingCookie) parts.push(existingCookie);
    if (sessionId) parts.push(`sessionid=${sessionId}`);
    if (sessionSign) parts.push(`sessionid_sign=${sessionSign}`);
    return parts.length > 0 ? parts.join('; ') : '';
}

function buildTradingViewHeaders(request) {
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
        const normalized = key.toLowerCase();
        if (HOP_BY_HOP_REQUEST_HEADERS.has(normalized)) continue;
        if (normalized.startsWith('x-tv-sessionid')) continue;
        headers.set(key, value);
    }

    headers.set('Origin', 'https://www.tradingview.com');
    headers.set('Referer', 'https://www.tradingview.com/');
    headers.set('X-Requested-With', 'XMLHttpRequest');

    const cookie = buildTradingViewCookie(request);
    if (cookie) headers.set('Cookie', cookie);
    else headers.delete('Cookie');
    return headers;
}

async function handleTradingView(request, url) {
    if (request.method === 'OPTIONS') {
        return createOptionsResponse('GET, POST, PATCH, DELETE, PUT, OPTIONS', 'Content-Type, x-tv-sessionid, x-tv-sessionid-sign');
    }

    const rawPath = url.searchParams.get('tv_path') || '';
    const upstreamPath = rawPath ? `/${rawPath.replace(/^\/+/, '')}` : '/';
    const query = new URLSearchParams(url.search);
    query.delete('tv_path');
    const upstreamUrl = `${TV_UPSTREAM_BASE}${upstreamPath}${query.toString() ? `?${query.toString()}` : ''}`;
    const method = request.method || 'GET';
    const hasBody = !['GET', 'HEAD'].includes(method.toUpperCase());

    try {
        const upstream = await fetch(upstreamUrl, {
            method,
            headers: buildTradingViewHeaders(request),
            body: hasBody ? await request.arrayBuffer() : undefined,
            redirect: 'manual',
        });

        const outHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
            if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
            outHeaders.set(key, value);
        });
        outHeaders.set('Access-Control-Allow-Origin', '*');
        outHeaders.set('Cache-Control', 'no-store');
        outHeaders.set('CDN-Cache-Control', 'no-store');
        outHeaders.set('Vary', 'x-tv-sessionid, x-tv-sessionid-sign, Cookie');

        return new Response(await upstream.arrayBuffer(), {
            status: upstream.status,
            headers: outHeaders
        });
    } catch (error) {
        return createJsonResponse(502, { error: 'TradingView proxy failed', details: error?.message || 'Unknown error' });
    }
}

async function proxyToOrigin(request, env, url) {
    const originBaseUrl = env?.ORIGIN_BASE_URL || '';
    if (!originBaseUrl) return null;
    const upstreamUrl = new URL(originBaseUrl);
    upstreamUrl.pathname = url.pathname;
    upstreamUrl.search = url.search;
    return fetch(new Request(upstreamUrl.toString(), request));
}

function isLikelyAssetPath(pathname) {
    const tail = pathname.split('/').pop() || '';
    return tail.includes('.');
}

async function handleStatic(request, env, url) {
    if (env?.ASSETS?.fetch) {
        let response = await env.ASSETS.fetch(request);
        if (request.method === 'GET' && response.status === 404 && !isLikelyAssetPath(url.pathname)) {
            const spaUrl = new URL(url.toString());
            spaUrl.pathname = '/index.html';
            spaUrl.search = '';
            response = await env.ASSETS.fetch(new Request(spaUrl.toString(), request));
        }
        return response;
    }

    const proxied = await proxyToOrigin(request, env, url);
    if (proxied) return proxied;

    return new Response('Not found. Configure ASSETS binding or ORIGIN_BASE_URL.', { status: 404 });
}

async function handleApi(request, env, url) {
    switch (url.pathname) {
        case '/api/fuckyouuuu':
            return handleGoogleBatch(request, url, { encryptedPost: true });
        case '/api/mobile-batch':
            return handleGoogleBatch(request, url, { encryptedPost: false });
        case '/api/fckyouuu1':
            return handleStrikeProxy(request, url);
        case '/api/scanx':
            return handleScanxProxy(request, url);
        case '/api/mobile-scanx':
            return handleMobileScanx(request);
        case '/api/mobile-strike':
            return handleMobileStrike(request);
        case '/api/tv':
            return handleTradingView(request, url);
        default: {
            const proxied = await proxyToOrigin(request, env, url);
            if (proxied) return proxied;
            return createJsonResponse(404, { error: 'Unknown API route' });
        }
    }
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        normalizeApiPath(url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url);
        }

        return handleStatic(request, env, url);
    }
};
