/**
 * Cloudflare Worker router:
 * - Serves static app via ASSETS binding
 * - Implements API proxies directly at edge
 * - Mirrors Vercel rewrite behavior (/api/v1/* and /api/tv/*)
 * - Publishes Market Map aggregate snapshots from R2
 */

import {
    advanceMarketMapRefresh,
    readMarketMapSnapshot,
    readMarketMapRefreshState,
    readMarketMapSnapshotManifest,
    readMarketMapSnapshotVersion,
    readThemeChartSnapshot,
    readThemeChartSnapshotManifest,
    readThemeChartSnapshotVersion
} from './marketMapSnapshot.mjs';

const API_V1_REWRITES = new Map([
    ['/api/v1/fuckyouuuu', '/api/fuckyouuuu'],
    ['/api/v1/fckyouuu1', '/api/fckyouuu1'],
    ['/api/v1/fckyouuu2', '/api/scanx'],
]);

const TV_UPSTREAM_BASE = 'https://www.tradingview.com/api/v1';
const WORKER_BUILD_ID = '2026-03-06-007';

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

const CF_BROTLI_MIN_BYTES = 1024;
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
            ...extraHeaders,
        },
    });
}

function withSnapshotDebugHeaders(headers, values = {}) {
    return {
        ...headers,
        'X-Snapshot-Scope': values.scope || '',
        'X-Snapshot-Version': values.versionId || '',
        'X-Snapshot-Source': values.source || '',
        'X-Snapshot-Cache-Policy': values.cachePolicy || '',
        'X-Worker-Cache': values.workerCache || '',
    };
}

function normalizeThemeChartInterval(interval) {
    return String(interval || '1Y').toUpperCase() === 'MAX' ? 'MAX' : '1Y';
}

function getAuthorizationBearerToken(request) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function isMarketMapRefreshAuthorized(request, env) {
    const expected = String(env?.MARKET_MAP_REFRESH_TOKEN || '').trim();
    if (!expected) return false;
    return getAuthorizationBearerToken(request) === expected;
}

async function parseOptionalJsonRequest(request) {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        return {};
    }

    try {
        return await request.json();
    } catch {
        return {};
    }
}

function logMarketMapRefreshFailure(source, error) {
    console.error('Market map refresh background failure', {
        source,
        error: error?.message || 'Unknown error',
    });
}

function enqueueMarketMapRefresh(ctx, env, source, options = {}) {
    if (!ctx?.waitUntil) return;
    ctx.waitUntil(
        advanceMarketMapRefresh(env, { source, force: options.force === true })
            .catch((error) => logMarketMapRefreshFailure(source, error))
    );
}

function buildWorkerCacheKey(url) {
    return new Request(url.toString(), { method: 'GET' });
}

async function matchWorkerCache(url) {
    const cache = caches.default;
    const key = buildWorkerCacheKey(url);
    return cache.match(key);
}

async function putWorkerCache(url, response) {
    if (!response || response.status !== 200) return;
    const cache = caches.default;
    const key = buildWorkerCacheKey(url);
    await cache.put(key, response.clone());
}

function cloneResponseWithHeaders(response, extraHeaders = {}) {
    const headers = new Headers(response.headers);
    Object.entries(extraHeaders).forEach(([key, value]) => {
        headers.set(key, value);
    });

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

function createOptionsResponse(allowMethods, allowHeaders = 'Content-Type') {
    return new Response(null, {
        status: 204,
        headers: {
            ...getNoStoreHeaders(),
            'Access-Control-Allow-Methods': allowMethods,
            'Access-Control-Allow-Headers': allowHeaders,
            Allow: allowMethods.replace(/,\s*/g, ', '),
        },
    });
}

function createMethodNotAllowedResponse(allowMethods) {
    return new Response('Method Not Allowed', {
        status: 405,
        headers: {
            ...getNoStoreHeaders(),
            Allow: allowMethods,
        },
    });
}

function pickEncoding(headerValue) {
    const header = String(headerValue || '').toLowerCase();
    if (header.includes('br')) return 'br';
    if (header.includes('gzip')) return 'gzip';
    return null;
}

async function createCompressedTextResponse(request, status, text, extraHeaders = {}) {
    const encoding = pickEncoding(request.headers.get('accept-encoding'));
    const payload = typeof text === 'string' ? text : String(text ?? '');

    const baseHeaders = {
        'Content-Type': 'text/plain; charset=utf-8',
        ...getNoStoreHeaders(),
        ...extraHeaders,
        Vary: 'Accept-Encoding',
    };

    if (!encoding || payload.length < CF_BROTLI_MIN_BYTES || typeof CompressionStream === 'undefined') {
        return new Response(payload, { status, headers: baseHeaders });
    }

    try {
        const stream = new CompressionStream(encoding);
        const writer = stream.writable.getWriter();
        await writer.write(new TextEncoder().encode(payload));
        await writer.close();

        return new Response(stream.readable, {
            status,
            headers: {
                ...baseHeaders,
                'Content-Encoding': encoding,
            },
        });
    } catch {
        return new Response(payload, { status, headers: baseHeaders });
    }
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
                Origin: 'https://www.google.com',
                Referer: 'https://www.google.com/finance/',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: new URLSearchParams({ 'f.req': decodedFReq }).toString(),
        });

        const text = await upstream.text();
        if (!upstream.ok) return createCompressedTextResponse(request, upstream.status, text || `Upstream Error: ${upstream.status}`);
        return createCompressedTextResponse(request, 200, text);
    } catch (error) {
        return createJsonResponse(500, { error: 'Proxy error', details: error?.message || 'Unknown error' });
    }
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
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
            },
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
                Accept: 'application/json',
                Origin: 'https://ow-static-scanx.dhan.co',
                Referer: 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify(payload),
        });
        const text = await upstream.text();

        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
            },
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
                Accept: 'application/json',
                Origin: 'https://ow-static-scanx.dhan.co',
                Referer: 'https://ow-static-scanx.dhan.co/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            body: JSON.stringify(payload),
        });
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
            },
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
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                ...getNoStoreHeaders(),
                'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
            },
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
            headers: outHeaders,
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

async function handleWorkerVersion(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    return createJsonResponse(200, {
        ok: true,
        buildId: WORKER_BUILD_ID,
        ts: new Date().toISOString(),
    });
}

async function handleMarketMapRefreshInternal(request, env) {
    if (request.method === 'OPTIONS') {
        return createOptionsResponse('POST, OPTIONS', 'Authorization, Content-Type');
    }
    if (request.method !== 'POST') {
        return createMethodNotAllowedResponse('POST, OPTIONS');
    }
    if (!isMarketMapRefreshAuthorized(request, env)) {
        return createJsonResponse(403, { ok: false, error: 'Forbidden' });
    }

    const body = await parseOptionalJsonRequest(request);
    const state = await advanceMarketMapRefresh(env, {
        jobId: String(body?.jobId || ''),
        source: String(body?.source || 'internal'),
        force: body?.force === true,
    });
    return createJsonResponse(202, {
        ok: true,
        state,
    });
}

async function handleMarketMapRefreshAdmin(request, env, url) {
    if (request.method === 'OPTIONS') {
        return createOptionsResponse('GET, POST, OPTIONS', 'Authorization, Content-Type');
    }
    if (!isMarketMapRefreshAuthorized(request, env)) {
        return createJsonResponse(403, { ok: false, error: 'Forbidden' });
    }

    if (url.pathname === '/api/admin/market-map-refresh/status') {
        if (request.method !== 'GET') {
            return createMethodNotAllowedResponse('GET, OPTIONS');
        }
        const state = await readMarketMapRefreshState(env);
        return createJsonResponse(200, {
            ok: true,
            state,
        });
    }

    if (request.method !== 'POST') {
        return createMethodNotAllowedResponse('POST, OPTIONS');
    }

    const body = await parseOptionalJsonRequest(request);
    const state = await advanceMarketMapRefresh(env, {
        jobId: String(body?.jobId || ''),
        source: String(body?.source || 'admin'),
        force: body?.force === true,
    });
    return createJsonResponse(202, {
        ok: true,
        state,
    });
}

function handleRemovedNseRoutes(request) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, POST, OPTIONS');
    return createJsonResponse(410, {
        ok: false,
        error: 'NSE snapshot APIs removed from worker',
        code: 'NSE_SNAPSHOT_REMOVED',
    });
}

async function handleMarketMapSnapshot(request, env, url, ctx) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, OPTIONS');
    if (request.method !== 'GET') return createMethodNotAllowedResponse('GET');

    const rawScope = (url.searchParams.get('scope') || 'nse').toLowerCase();
    const scope = rawScope === 'all' ? 'all' : 'nse';

    try {
        const stored = await readMarketMapSnapshotManifest(env, scope);
        if (!stored?.manifest) {
            const legacy = await readMarketMapSnapshot(env, scope);
            if (legacy?.snapshot) {
                const response = createJsonResponse(200, {
                    ok: true,
                    scope,
                    manifest: {
                        version: legacy.snapshot.version,
                        versionId: legacy.customMetadata?.versionId || `legacy-${legacy.snapshot.generatedAt || scope}`,
                        scope,
                        generatedAt: legacy.snapshot.generatedAt,
                        legacy: true,
                    },
                }, withSnapshotDebugHeaders({
                    'Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                    'CDN-Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                }, {
                    scope,
                    versionId: legacy.customMetadata?.versionId || `legacy-${legacy.snapshot.generatedAt || scope}`,
                    source: 'legacy-manifest',
                    cachePolicy: 'manifest',
                    workerCache: 'BYPASS'
                }));
                return response;
            }
            enqueueMarketMapRefresh(ctx, env, 'snapshot-missing-manifest');
            return createJsonResponse(404, {
                ok: false,
                error: 'Market Map snapshot manifest not found',
                code: 'MARKET_MAP_SNAPSHOT_MISSING',
                scope,
            });
        }

        const response = createJsonResponse(200, {
            ok: true,
            scope,
            manifest: stored.manifest,
        }, withSnapshotDebugHeaders({
            'Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
            'CDN-Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
        }, {
            scope,
            versionId: stored.manifest?.versionId || '',
            source: 'manifest',
            cachePolicy: 'manifest',
            workerCache: 'BYPASS'
        }));
        return response;
    } catch (error) {
        return createJsonResponse(500, {
            ok: false,
            error: 'Failed to read Market Map snapshot manifest',
            details: error?.message || 'Unknown error',
        });
    }
}

async function handleMarketMapSnapshotVersion(request, env, url, ctx) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, OPTIONS');
    if (request.method !== 'GET') return createMethodNotAllowedResponse('GET');

    const rawScope = (url.searchParams.get('scope') || 'nse').toLowerCase();
    const scope = rawScope === 'all' ? 'all' : 'nse';
    const versionId = (url.searchParams.get('version') || '').trim();

    if (!versionId) {
        return createJsonResponse(400, {
            ok: false,
            error: 'Missing version',
            code: 'MARKET_MAP_SNAPSHOT_VERSION_REQUIRED',
        });
    }

    const cached = await matchWorkerCache(url);
    if (cached) {
        return cloneResponseWithHeaders(cached, { 'X-Worker-Cache': 'HIT' });
    }

    try {
        const stored = await readMarketMapSnapshotVersion(env, scope, versionId);
        if (!stored?.snapshot) {
            if (versionId.startsWith('legacy-')) {
                const legacy = await readMarketMapSnapshot(env, scope);
                if (legacy?.snapshot) {
                    const response = createJsonResponse(200, {
                        ok: true,
                        scope,
                        versionId,
                        snapshot: legacy.snapshot,
                    }, withSnapshotDebugHeaders({
                        'Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                        'CDN-Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                        ETag: `"market-map-${scope}-${versionId}"`,
                    }, {
                        scope,
                        versionId,
                        source: 'legacy-payload',
                        cachePolicy: 'payload',
                        workerCache: 'MISS'
                    }));
                    if (ctx?.waitUntil) ctx.waitUntil(putWorkerCache(url, response));
                    return response;
                }
            }
            return createJsonResponse(404, {
                ok: false,
                error: 'Market Map snapshot version not found',
                code: 'MARKET_MAP_SNAPSHOT_VERSION_MISSING',
                scope,
                versionId,
            });
        }

        const response = createJsonResponse(200, {
            ok: true,
            scope,
            versionId,
            snapshot: stored.snapshot,
        }, withSnapshotDebugHeaders({
            'Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
            'CDN-Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
            ETag: `"market-map-${scope}-${versionId}"`,
        }, {
            scope,
            versionId,
            source: 'payload',
            cachePolicy: 'payload',
            workerCache: 'MISS'
        }));
        if (ctx?.waitUntil) ctx.waitUntil(putWorkerCache(url, response));
        return response;
    } catch (error) {
        return createJsonResponse(500, {
            ok: false,
            error: 'Failed to read Market Map snapshot version',
            details: error?.message || 'Unknown error',
        });
    }
}

async function handleMarketMapChartSnapshot(request, env, url, ctx) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, OPTIONS');
    if (request.method !== 'GET') return createMethodNotAllowedResponse('GET');

    const rawScope = (url.searchParams.get('scope') || 'nse').toLowerCase();
    const scope = rawScope === 'all' ? 'all' : 'nse';
    const theme = (url.searchParams.get('theme') || '').trim();
    const interval = normalizeThemeChartInterval(url.searchParams.get('interval'));

    if (!theme) {
        return createJsonResponse(400, {
            ok: false,
            error: 'Missing theme',
            code: 'MARKET_MAP_CHART_THEME_REQUIRED',
        });
    }

    try {
        const stored = await readThemeChartSnapshotManifest(env, scope, theme, interval);
        if (!stored?.manifest) {
            const legacy = await readThemeChartSnapshot(env, scope, theme, interval);
            if (legacy?.snapshot) {
                const response = createJsonResponse(200, {
                    ok: true,
                    scope,
                    theme,
                    manifest: {
                        version: legacy.snapshot.version,
                        versionId: legacy.customMetadata?.versionId || `legacy-${legacy.snapshot.generatedAt || theme}`,
                        scope,
                        theme,
                        interval,
                        generatedAt: legacy.snapshot.generatedAt,
                        legacy: true,
                    },
                }, withSnapshotDebugHeaders({
                    'Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                    'CDN-Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                }, {
                    scope,
                    versionId: legacy.customMetadata?.versionId || `legacy-${legacy.snapshot.generatedAt || theme}`,
                    source: 'legacy-chart-manifest',
                    cachePolicy: 'chart-manifest',
                    workerCache: 'BYPASS'
                }));
                return response;
            }
            enqueueMarketMapRefresh(ctx, env, 'chart-missing-manifest');
            return createJsonResponse(404, {
                ok: false,
                error: 'Market Map chart snapshot manifest not found',
                code: 'MARKET_MAP_CHART_SNAPSHOT_MISSING',
                scope,
                theme,
                interval,
            });
        }

        const response = createJsonResponse(200, {
            ok: true,
            scope,
            theme,
            interval,
            manifest: stored.manifest,
        }, withSnapshotDebugHeaders({
            'Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
            'CDN-Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
        }, {
            scope,
            versionId: stored.manifest?.versionId || '',
            source: 'chart-manifest',
            cachePolicy: 'chart-manifest',
            workerCache: 'BYPASS'
        }));
        return response;
    } catch (error) {
        return createJsonResponse(500, {
            ok: false,
            error: 'Failed to read Market Map chart snapshot manifest',
            details: error?.message || 'Unknown error',
        });
    }
}

async function handleMarketMapChartSnapshotVersion(request, env, url, ctx) {
    if (request.method === 'OPTIONS') return createOptionsResponse('GET, OPTIONS');
    if (request.method !== 'GET') return createMethodNotAllowedResponse('GET');

    const rawScope = (url.searchParams.get('scope') || 'nse').toLowerCase();
    const scope = rawScope === 'all' ? 'all' : 'nse';
    const theme = (url.searchParams.get('theme') || '').trim();
    const versionId = (url.searchParams.get('version') || '').trim();
    const interval = normalizeThemeChartInterval(url.searchParams.get('interval'));

    if (!theme || !versionId) {
        return createJsonResponse(400, {
            ok: false,
            error: 'Missing theme or version',
            code: 'MARKET_MAP_CHART_SNAPSHOT_VERSION_REQUIRED',
        });
    }

    const cached = await matchWorkerCache(url);
    if (cached) {
        return cloneResponseWithHeaders(cached, { 'X-Worker-Cache': 'HIT' });
    }

    try {
        const stored = await readThemeChartSnapshotVersion(env, scope, theme, versionId, interval);
        if (!stored?.snapshot) {
            if (versionId.startsWith('legacy-')) {
                const legacy = await readThemeChartSnapshot(env, scope, theme, interval);
                if (legacy?.snapshot) {
                    const response = createJsonResponse(200, {
                        ok: true,
                        scope,
                        theme,
                        interval,
                        versionId,
                        snapshot: legacy.snapshot,
                    }, withSnapshotDebugHeaders({
                        'Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                        'CDN-Cache-Control': legacy?.httpMetadata?.cacheControl || 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
                        ETag: `"market-map-chart-${scope}-${versionId}"`,
                    }, {
                        scope,
                        versionId,
                        source: 'legacy-chart-payload',
                        cachePolicy: 'chart-payload',
                        workerCache: 'MISS'
                    }));
                    if (ctx?.waitUntil) ctx.waitUntil(putWorkerCache(url, response));
                    return response;
                }
            }
            return createJsonResponse(404, {
                ok: false,
                error: 'Market Map chart snapshot version not found',
                code: 'MARKET_MAP_CHART_SNAPSHOT_VERSION_MISSING',
                scope,
                theme,
                interval,
                versionId,
            });
        }

        const response = createJsonResponse(200, {
            ok: true,
            scope,
            theme,
            interval,
            versionId,
            snapshot: stored.snapshot,
        }, withSnapshotDebugHeaders({
            'Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
            'CDN-Cache-Control': stored?.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable',
            ETag: `"market-map-chart-${scope}-${versionId}"`,
        }, {
            scope,
            versionId,
            source: 'chart-payload',
            cachePolicy: 'chart-payload',
            workerCache: 'MISS'
        }));
        if (ctx?.waitUntil) ctx.waitUntil(putWorkerCache(url, response));
        return response;
    } catch (error) {
        return createJsonResponse(500, {
            ok: false,
            error: 'Failed to read Market Map chart snapshot version',
            details: error?.message || 'Unknown error',
        });
    }
}

async function handleApi(request, env, url, ctx) {
    if (url.pathname.startsWith('/api/nse/')) {
        return handleRemovedNseRoutes(request);
    }

    if (url.pathname === '/api/version') {
        return handleWorkerVersion(request);
    }

    switch (url.pathname) {
        case '/api/internal/market-map-refresh':
            return handleMarketMapRefreshInternal(request, env);
        case '/api/admin/market-map-refresh':
        case '/api/admin/market-map-refresh/status':
            return handleMarketMapRefreshAdmin(request, env, url);
        case '/api/market-map/snapshot':
            return handleMarketMapSnapshot(request, env, url, ctx);
        case '/api/market-map/snapshot/version':
            return handleMarketMapSnapshotVersion(request, env, url, ctx);
        case '/api/market-map/chart-snapshot':
            return handleMarketMapChartSnapshot(request, env, url, ctx);
        case '/api/market-map/chart-snapshot/version':
            return handleMarketMapChartSnapshotVersion(request, env, url, ctx);
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
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        normalizeApiPath(url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url, ctx);
        }

        return handleStatic(request, env, url);
    },

    async scheduled(_controller, env, ctx) {
        enqueueMarketMapRefresh(ctx, env, 'scheduled');
    },
};
