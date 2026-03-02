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

const NSE_SNAPSHOT_PREFIX = 'snapshots/nse';
const NSE_META_KEY = `${NSE_SNAPSHOT_PREFIX}/meta.json`;
const NSE_CHUNK_PREFIX = `${NSE_SNAPSHOT_PREFIX}/chunks/`;
const DEFAULT_NSE_CHUNK_MODE = 'alpha2';
const NSE_SNAPSHOT_CACHE_CONTROL = 'public, max-age=300';
const NSE_META_CACHE_CONTROL = 'public, max-age=60';

const INTERVAL_SNAPSHOT_PREFIX = 'snapshots/intervals';
const INTERVAL_META_KEY = `${INTERVAL_SNAPSHOT_PREFIX}/meta.json`;
const INTERVAL_META_CACHE_CONTROL = 'public, max-age=60';
const INTERVAL_SNAPSHOT_CACHE_CONTROL = 'public, max-age=300';
const DEFAULT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y'];
const INTERVAL_WINDOWS = {
    '1D': 1, '5D': 2, '1M': 3, '3M': 4, '6M': 4,
    'YTD': 5, '1Y': 6, '5Y': 7, 'MAX': 8
};
const GOOGLE_RPC_CHART = 'AiCwsd';
const GOOGLE_RPC_PRICE = 'xh8wxf';
const GOOGLE_RPC_FUNDA = 'HqGpWd';

const PRICE_SNAPSHOT_PREFIX = 'snapshots/prices';
const PRICE_META_KEY = `${PRICE_SNAPSHOT_PREFIX}/meta.json`;
const FUNDA_SNAPSHOT_PREFIX = 'snapshots/fundamentals';
const FUNDA_META_KEY = `${FUNDA_SNAPSHOT_PREFIX}/meta.json`;
const CHART_SNAPSHOT_PREFIX = 'snapshots/charts';
const CHART_META_KEY = `${CHART_SNAPSHOT_PREFIX}/meta.json`;
const WORKER_BUILD_ID = '2026-03-02-002';
const DEFAULT_SNAPSHOT_ORIGIN = 'https://nexus.themetracker.workers.dev';
const REFRESH_STATUS_KEY = 'snapshots/system/refresh-status.json';

let cachedDecryptKey = null;
let lastRefreshState = {
    runId: null,
    startedAt: null,
    finishedAt: null,
    status: 'idle',
    errors: {},
};

async function writeRefreshStatus(env, status) {
    if (!env?.NSE_SNAPSHOTS?.put) return;
    try {
        await putSnapshotObject(env, REFRESH_STATUS_KEY, status, { gzip: false, cacheControl: 'no-store' });
    } catch (error) {
        console.error('[Refresh Status] write failed', error);
    }
}

async function readRefreshStatus(env) {
    if (!env?.NSE_SNAPSHOTS?.get) return null;
    try {
        const object = await env.NSE_SNAPSHOTS.get(REFRESH_STATUS_KEY);
        if (!object) return null;
        const text = await object.text();
        return JSON.parse(text);
    } catch {
        return null;
    }
}

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

const CF_BROTLI_MIN_BYTES = 1024;

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
        'Vary': 'Accept-Encoding',
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

function normalizeSymbol(symbol) {
    return String(symbol || '')
        .trim()
        .toUpperCase()
        .replace(/^(NSE|BSE|BOM|GOOGLE):/i, '')
        .replace(/:(NSE|BOM|BSE)$/i, '')
        .replace(/\.(NS|BO)$/i, '')
        .replace(/-EQ$/i, '')
        .split(':')[0];
}

function resolveChunkMode(value) {
    const mode = String(value || '').trim().toLowerCase();
    if (mode === 'alpha1' || mode === 'alpha2') return mode;
    return DEFAULT_NSE_CHUNK_MODE;
}

function chunkKeyForSymbol(symbol, chunkMode) {
    const cleaned = normalizeSymbol(symbol);
    if (!cleaned) return chunkMode === 'alpha2' ? '__' : '_';
    const first = cleaned[0];
    const isAlpha = first >= 'A' && first <= 'Z';
    const isDigit = first >= '0' && first <= '9';

    if (chunkMode === 'alpha2') {
        if (isDigit) return '0-9';
        if (!isAlpha) return '__';
        const second = cleaned.length > 1 ? cleaned[1] : '_';
        const secondKey = second >= 'A' && second <= 'Z' ? second : '_';
        return `${first}${secondKey}`;
    }

    if (isDigit) return '0-9';
    if (!isAlpha) return '_';
    return first;
}

function extractSymbolMap(payload) {
    if (!payload) return { map: new Map(), format: 'empty' };

    const pickCandidate = () => {
        if (payload?.data && typeof payload.data === 'object') return payload.data;
        if (payload?.symbols && typeof payload.symbols === 'object') return payload.symbols;
        return payload;
    };

    const candidate = pickCandidate();
    const map = new Map();

    if (Array.isArray(candidate)) {
        candidate.forEach((row) => {
            const symbol = normalizeSymbol(row?.symbol ?? row?.sym ?? row?.s);
            if (!symbol) return;
            map.set(symbol, row);
        });
        return { map, format: 'array' };
    }

    if (candidate && typeof candidate === 'object') {
        Object.entries(candidate).forEach(([key, value]) => {
            const symbol = normalizeSymbol(value?.symbol ?? key);
            if (!symbol) return;
            map.set(symbol, value);
        });
        return { map, format: 'map' };
    }

    return { map, format: 'unknown' };
}

async function gzipString(payload) {
    if (typeof CompressionStream === 'undefined') {
        return { data: new TextEncoder().encode(payload), encoding: null };
    }
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    await writer.write(new TextEncoder().encode(payload));
    await writer.close();
    const buffer = await new Response(stream.readable).arrayBuffer();
    return { data: new Uint8Array(buffer), encoding: 'gzip' };
}

function buildSourceHeaders(env) {
    const headers = new Headers({ Accept: 'application/json' });
    if (env?.NSE_SNAPSHOT_AUTH_TOKEN) {
        headers.set('Authorization', `Bearer ${env.NSE_SNAPSHOT_AUTH_TOKEN}`);
    }
    if (env?.NSE_SNAPSHOT_HEADERS_JSON) {
        try {
            const extra = JSON.parse(env.NSE_SNAPSHOT_HEADERS_JSON);
            if (extra && typeof extra === 'object') {
                Object.entries(extra).forEach(([key, value]) => {
                    if (typeof value === 'string') headers.set(key, value);
                });
            }
        } catch {
            // ignore malformed header overrides
        }
    }
    return headers;
}

function resolveSnapshotSourceUrl(env) {
    const direct = String(env?.NSE_SNAPSHOT_SOURCE_URL || '').trim();
    const manualOrigin = String(env?._manualOrigin || '').trim();
    const origin = String(env?.ORIGIN_BASE_URL || '').trim();
    const fallback = String(env?.NSE_SNAPSHOT_FALLBACK_URL || '').trim();

    const candidates = [
        direct,
        manualOrigin ? new URL('/data.json', manualOrigin).toString() : '',
        origin ? new URL('/data.json', origin).toString() : '',
        fallback,
        DEFAULT_SNAPSHOT_ORIGIN ? new URL('/data.json', DEFAULT_SNAPSHOT_ORIGIN).toString() : '',
    ].filter(Boolean);

    return candidates[0] || '';
}

function parseIntervalListValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_INTERVALS.slice();
    return raw.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
}

function parseIntervalList(env) {
    return parseIntervalListValue(env?.NSE_INTERVAL_SNAPSHOT_INTERVALS);
}

function getIntervalWindow(interval) {
    return INTERVAL_WINDOWS[interval] || 3;
}

function buildGoogleBatchUrl(rpcId) {
    return `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${encodeURIComponent(rpcId)}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
}

function getExchangeForSymbol(symbol) {
    return /^\d+$/.test(symbol) ? 'BOM' : 'NSE';
}

function extractPriceFromFrame(payload) {
    const quote = payload?.[0]?.[0]?.[0];
    if (!Array.isArray(quote)) return null;

    const symbolInfo = quote[1];
    const priceTuple = quote[5];
    const prevClose = quote[7];

    if (!Array.isArray(priceTuple) || typeof priceTuple[0] !== 'number') return null;
    if (!Array.isArray(symbolInfo)) return null;

    return {
        symbol: normalizeSymbol(symbolInfo[0]),
        data: {
            price: priceTuple[0],
            change: priceTuple[1] || 0,
            changePct: priceTuple[2] || 0,
            prevClose: prevClose || 0,
            source: 'google'
        }
    };
}

function extractFundaFromFrame(payload) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    return {
        name: root[1],
        description: root[2],
        founded: Array.isArray(root[4]) ? root[4][0] : root[4],
        ceo: root[5],
        employees: root[6],
        marketCap: root[7],
        price: root[8],
        prevClose: root[9],
        high: root[10],
        low: root[11],
        high52: root[12],
        low52: root[13],
        volume: root[14],
        peRatio: root[16],
        yield: root[17],
        avgVolume: root[18],
        eps: root[19],
        shares: root[21],
        url: root[22],
        exchange: root[24]
    };
}

function extractWideChartFromFrame(payload) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];
    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }
    if (!Array.isArray(points) || points.length === 0) return null;

    const parseTime = (val) => {
        if (typeof val === 'number') return val;
        if (Array.isArray(val)) {
            const [y, m, d, h, min] = val;
            return new Date(y, m - 1, d, h || 0, min || 0).getTime();
        }
        return 0;
    };

    const rawSeries = points.map((p) => {
        const stats = p[1];
        const time = parseTime(p[0]);
        const close = stats?.[0] || 0;
        const changePct = (stats?.[2] || 0) * 100;

        const validateAbs = (val) => {
            if (!val || val <= 0) return close;
            if (val < close * 0.1) return close;
            return val;
        };

        const high = validateAbs(stats?.[3]);
        const low = validateAbs(stats?.[4]);
        const open = validateAbs(stats?.[5]);
        const volume = p[2] || 0;

        return { time, close, open, high, low, volume, changePct };
    }).filter((p) => isFinite(p.close) && p.time > 0);

    const series = rawSeries.map((p) => ({ ...p, price: p.close, value: p.close }));

    return {
        symbol: normalizeSymbol(symbolInfo?.[0]),
        series,
    };
}

async function executeGoogleBatch(entries, rpcId) {
    if (!entries.length) return { text: '', responseTtlMs: null };
    const url = buildGoogleBatchUrl(rpcId);
    const fReq = JSON.stringify([entries]);
    const upstream = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
            'Origin': 'https://www.google.com',
            'Referer': 'https://www.google.com/finance/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: new URLSearchParams({ 'f.req': fReq }).toString(),
    });

    if (!upstream.ok) throw new Error(`Google batch failed: ${upstream.status}`);
    return { text: await upstream.text(), responseTtlMs: null };
}

function parseAllFrames(text) {
    const frames = [];
    const lines = String(text || '').split('\n');

    for (let line of lines) {
        line = line.trim();
        if (!line.startsWith('[') || !line.includes('"wrb.fr"')) continue;
        try {
            const parsed = JSON.parse(line);
            if (!Array.isArray(parsed)) continue;
            for (const frame of parsed) {
                if (!Array.isArray(frame) || frame[0] !== 'wrb.fr') continue;
                try {
                    const payload = JSON.parse(frame[2]);
                    frames.push({ rpcId: frame[1], payload });
                } catch { /* ignore */ }
            }
        } catch { /* ignore */ }
    }

    return frames;
}

function extractIntervalFromFrame(payload, interval) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];
    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }
    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || points.length === 0) return null;

    const lastPoint = points[points.length - 1];
    const close = lastPoint?.[1]?.[0];
    let changePct = lastPoint?.[1]?.[2];

    if (interval === '3M') {
        const lookback = 63;
        const startIndex = Math.max(0, points.length - 1 - lookback);
        const startPrice = points[startIndex]?.[1]?.[0];
        if (startPrice && close) {
            changePct = ((close - startPrice) / startPrice);
        }
    }

    if (typeof changePct !== 'number' || !isFinite(changePct)) return null;

    return {
        symbol: normalizeSymbol(symbolInfo[0]),
        data: { changePct: changePct * 100, close }
    };
}

async function fetchUniverseData(env) {
    const snapshotUrl = resolveSnapshotSourceUrl(env);
    if (snapshotUrl) {
        const response = await fetch(snapshotUrl, {
            headers: buildSourceHeaders(env),
            signal: env?._abortSignal,
        });
        if (!response.ok) throw new Error(`Universe fetch failed: ${response.status}`);
        return await response.json();
    }

    if (env?.ASSETS?.fetch) {
        const response = await env.ASSETS.fetch(new Request('https://assets.local/data.json'), {
            signal: env?._abortSignal,
        });
        if (!response.ok) throw new Error(`Asset universe fetch failed: ${response.status}`);
        return await response.json();
    }

    throw new Error('No universe source available');
}

async function putSnapshotObject(env, key, payload, { gzip = true, cacheControl } = {}) {
    if (!env?.NSE_SNAPSHOTS?.put) {
        throw new Error('NSE_SNAPSHOTS binding missing');
    }

    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    let data = text;
    let encoding = null;

    if (gzip) {
        const compressed = await gzipString(text);
        data = compressed.data;
        encoding = compressed.encoding;
    }

    await env.NSE_SNAPSHOTS.put(key, data, {
        httpMetadata: {
            contentType: 'application/json; charset=utf-8',
            contentEncoding: encoding || undefined,
            cacheControl: cacheControl || NSE_SNAPSHOT_CACHE_CONTROL,
        },
    });
}

async function refreshNseSnapshots(env) {
    let payload;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('timeout'), 120_000);
    try {
        payload = await fetchUniverseData({
            ...env,
            _abortSignal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }

    const { map: symbolMap, format } = extractSymbolMap(payload);
    if (symbolMap.size === 0) {
        throw new Error('NSE snapshot returned no symbols');
    }

    const chunkMode = resolveChunkMode(env.NSE_SNAPSHOT_CHUNK_MODE);
    const chunks = new Map();

    symbolMap.forEach((value, symbol) => {
        const key = chunkKeyForSymbol(symbol, chunkMode);
        let bucket = chunks.get(key);
        if (!bucket) {
            bucket = new Map();
            chunks.set(key, bucket);
        }
        bucket.set(symbol, value);
    });

    for (const [chunkKey, bucket] of chunks) {
        const chunkPayload = Object.fromEntries(bucket);
        await putSnapshotObject(
            env,
            `${NSE_CHUNK_PREFIX}${chunkKey}.json.gz`,
            chunkPayload,
            { gzip: true, cacheControl: NSE_SNAPSHOT_CACHE_CONTROL }
        );
    }

    const generatedAt = new Date().toISOString();
    let sourceHost = '';
    try {
        sourceHost = new URL(env.NSE_SNAPSHOT_SOURCE_URL).host;
    } catch {
        sourceHost = '';
    }

    const meta = {
        schemaVersion: 1,
        generatedAt,
        sourceHost,
        format,
        chunkMode,
        totalSymbols: symbolMap.size,
        chunkCount: chunks.size,
        chunks: Array.from(chunks.keys()).sort(),
    };

    await putSnapshotObject(env, NSE_META_KEY, meta, { gzip: false, cacheControl: NSE_META_CACHE_CONTROL });
}

async function runRefreshPipeline(env) {
    const runId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const errors = {};

    await writeRefreshStatus(env, {
        runId,
        startedAt,
        finishedAt: null,
        status: 'running',
        errors: {},
    });

    try {
        await refreshNseSnapshots(env);
    } catch (error) {
        errors.nse = error?.message || 'NSE snapshot failed';
        console.error('[NSE Snapshot] refresh failed', error);
    }
    try {
        await refreshIntervalSnapshots(env);
    } catch (error) {
        errors.intervals = error?.message || 'Interval snapshot failed';
        console.error('[Interval Snapshot] refresh failed', error);
    }
    try {
        await refreshPriceSnapshots(env);
    } catch (error) {
        errors.prices = error?.message || 'Price snapshot failed';
        console.error('[Price Snapshot] refresh failed', error);
    }
    try {
        await refreshChartSnapshots(env);
    } catch (error) {
        errors.charts = error?.message || 'Chart snapshot failed';
        console.error('[Chart Snapshot] refresh failed', error);
    }

    const finishedAt = new Date().toISOString();
    const result = { runId, startedAt, finishedAt, errors, ok: Object.keys(errors).length === 0 };
    await writeRefreshStatus(env, {
        runId,
        startedAt,
        finishedAt,
        status: result.ok ? 'success' : 'error',
        errors,
    });
    return result;
}

async function refreshIntervalSnapshots(env) {
    if (!env?.NSE_INTERVAL_SNAPSHOT_ENABLED || String(env.NSE_INTERVAL_SNAPSHOT_ENABLED).toLowerCase() !== 'true') {
        return;
    }

    const rawUniverse = await fetchUniverseData(env);
    if (!Array.isArray(rawUniverse)) {
        throw new Error('Universe payload invalid');
    }

    const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
    if (symbols.length === 0) {
        throw new Error('Universe returned no symbols');
    }

    const intervals = parseIntervalList(env);
    const chunkMode = resolveChunkMode(env?.NSE_SNAPSHOT_CHUNK_MODE);
    const batchSize = Math.max(1, Math.min(Number(env?.NSE_INTERVAL_SNAPSHOT_BATCH_SIZE || 550), 550));
    const concurrency = Math.max(1, Math.min(Number(env?.NSE_INTERVAL_SNAPSHOT_CONCURRENCY || 3), 8));

    const metaChunks = new Set();

    for (const interval of intervals) {
        const window = getIntervalWindow(interval);
        const buckets = new Map();

        const ensureBucket = (key) => {
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = {};
                buckets.set(key, bucket);
            }
            return bucket;
        };

        const chunks = [];
        for (let i = 0; i < symbols.length; i += batchSize) {
            chunks.push(symbols.slice(i, i + batchSize));
        }

        let cursor = 0;
        const runWorker = async () => {
            while (cursor < chunks.length) {
                const index = cursor;
                cursor += 1;
                const groupSymbols = chunks[index];
                const entries = groupSymbols.map((sym) => {
                    const ex = /^\d+$/.test(sym) ? 'BOM' : 'NSE';
                    const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
                    return [GOOGLE_RPC_CHART, rpcArgs, null, 'generic'];
                });

                let frames = [];
                try {
                    const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_CHART);
                    frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
                } catch (error) {
                    console.error(`[Interval Snapshot] Batch failed (${interval})`, error);
                }

                const returned = new Map();
                frames.forEach((frame) => {
                    const extracted = extractIntervalFromFrame(frame.payload, interval);
                    if (extracted?.symbol) {
                        returned.set(extracted.symbol, extracted.data);
                    }
                });

                groupSymbols.forEach((sym) => {
                    const data = returned.has(sym) ? returned.get(sym) : null;
                    const chunkKey = chunkKeyForSymbol(sym, chunkMode);
                    metaChunks.add(chunkKey);
                    const bucket = ensureBucket(chunkKey);
                    bucket[sym] = data;
                });
            }
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, runWorker));

        for (const [chunkKey, bucket] of buckets.entries()) {
            await putSnapshotObject(
                env,
                `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/chunks/${chunkKey}.json.gz`,
                bucket,
                { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
            );
        }

        const intervalMeta = {
            interval,
            window,
            generatedAt: new Date().toISOString(),
            symbolCount: symbols.length,
            chunkMode,
            chunkCount: buckets.size,
            chunks: Array.from(buckets.keys()).sort(),
        };

        await putSnapshotObject(
            env,
            `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/meta.json`,
            intervalMeta,
            { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL }
        );
    }

    const meta = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        intervals,
        chunkMode,
        chunks: Array.from(metaChunks).sort(),
        chunkCount: metaChunks.size,
        symbolCount: symbols.length,
    };

    await putSnapshotObject(env, INTERVAL_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}

async function refreshPriceSnapshots(env) {
    if (!env?.NSE_PRICE_SNAPSHOT_ENABLED || String(env.NSE_PRICE_SNAPSHOT_ENABLED).toLowerCase() !== 'true') {
        return;
    }

    const rawUniverse = await fetchUniverseData(env);
    if (!Array.isArray(rawUniverse)) throw new Error('Universe payload invalid');

    const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
    if (symbols.length === 0) throw new Error('Universe returned no symbols');

    const chunkMode = resolveChunkMode(env?.NSE_SNAPSHOT_CHUNK_MODE);
    const batchSize = Math.max(1, Math.min(Number(env?.NSE_PRICE_SNAPSHOT_BATCH_SIZE || 550), 550));
    const concurrency = Math.max(1, Math.min(Number(env?.NSE_PRICE_SNAPSHOT_CONCURRENCY || 3), 8));

    const buckets = new Map();
    const ensureBucket = (key) => {
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = {};
            buckets.set(key, bucket);
        }
        return bucket;
    };

    const batches = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
    }

    let cursor = 0;
    const runWorker = async () => {
        while (cursor < batches.length) {
            const index = cursor;
            cursor += 1;
            const groupSymbols = batches[index];
            const entries = groupSymbols.map((sym) => {
                const ex = getExchangeForSymbol(sym);
                const rpcArgs = JSON.stringify([[[null, [sym, ex]]], 1]);
                return [GOOGLE_RPC_PRICE, rpcArgs, null, 'generic'];
            });

            let frames = [];
            try {
                const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_PRICE);
                frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_PRICE);
            } catch (error) {
                console.error('[Price Snapshot] Batch failed', error);
            }

            const returned = new Map();
            frames.forEach((frame) => {
                const extracted = extractPriceFromFrame(frame.payload);
                if (extracted?.symbol) returned.set(extracted.symbol, extracted.data);
            });

            groupSymbols.forEach((sym) => {
                const data = returned.has(sym) ? returned.get(sym) : null;
                const chunkKey = chunkKeyForSymbol(sym, chunkMode);
                const bucket = ensureBucket(chunkKey);
                bucket[sym] = data;
            });
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, runWorker));

    for (const [chunkKey, bucket] of buckets.entries()) {
        await putSnapshotObject(
            env,
            `${PRICE_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`,
            bucket,
            { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
        );
    }

    const meta = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        chunkMode,
        chunkCount: buckets.size,
        symbolCount: symbols.length,
        chunks: Array.from(buckets.keys()).sort(),
    };

    await putSnapshotObject(env, PRICE_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}

async function refreshFundaSnapshots(env) {
    if (!env?.NSE_FUNDA_SNAPSHOT_ENABLED || String(env.NSE_FUNDA_SNAPSHOT_ENABLED).toLowerCase() !== 'true') {
        return;
    }

    const rawUniverse = await fetchUniverseData(env);
    if (!Array.isArray(rawUniverse)) throw new Error('Universe payload invalid');

    const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
    if (symbols.length === 0) throw new Error('Universe returned no symbols');

    const chunkMode = resolveChunkMode(env?.NSE_SNAPSHOT_CHUNK_MODE);
    const batchSize = Math.max(1, Math.min(Number(env?.NSE_FUNDA_SNAPSHOT_BATCH_SIZE || 200), 550));
    const concurrency = Math.max(1, Math.min(Number(env?.NSE_FUNDA_SNAPSHOT_CONCURRENCY || 2), 6));

    const buckets = new Map();
    const ensureBucket = (key) => {
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = {};
            buckets.set(key, bucket);
        }
        return bucket;
    };

    const batches = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
        batches.push(symbols.slice(i, i + batchSize));
    }

    let cursor = 0;
    const runWorker = async () => {
        while (cursor < batches.length) {
            const index = cursor;
            cursor += 1;
            const groupSymbols = batches[index];
            const entries = groupSymbols.map((sym) => {
                const ex = getExchangeForSymbol(sym);
                const rpcArgs = JSON.stringify([[[null, [sym, ex]]]]);
                return [GOOGLE_RPC_FUNDA, rpcArgs, null, 'generic'];
            });

            let frames = [];
            try {
                const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_FUNDA);
                frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_FUNDA);
            } catch (error) {
                console.error('[Funda Snapshot] Batch failed', error);
            }

            const returned = new Map();
            groupSymbols.forEach((sym, idx) => {
                const frame = frames[idx];
                if (!frame) return;
                const extracted = extractFundaFromFrame(frame.payload);
                if (extracted) returned.set(sym, extracted);
            });

            groupSymbols.forEach((sym) => {
                const data = returned.has(sym) ? returned.get(sym) : null;
                const chunkKey = chunkKeyForSymbol(sym, chunkMode);
                const bucket = ensureBucket(chunkKey);
                bucket[sym] = data;
            });
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, runWorker));

    for (const [chunkKey, bucket] of buckets.entries()) {
        await putSnapshotObject(
            env,
            `${FUNDA_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`,
            bucket,
            { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
        );
    }

    const meta = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        chunkMode,
        chunkCount: buckets.size,
        symbolCount: symbols.length,
        chunks: Array.from(buckets.keys()).sort(),
    };

    await putSnapshotObject(env, FUNDA_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}

async function refreshChartSnapshots(env) {
    if (!env?.NSE_CHART_SNAPSHOT_ENABLED || String(env.NSE_CHART_SNAPSHOT_ENABLED).toLowerCase() !== 'true') {
        return;
    }

    const rawUniverse = await fetchUniverseData(env);
    if (!Array.isArray(rawUniverse)) throw new Error('Universe payload invalid');
    const symbols = Array.from(new Set(rawUniverse.map((row) => normalizeSymbol(row?.symbol)).filter(Boolean)));
    if (symbols.length === 0) throw new Error('Universe returned no symbols');

    const intervals = parseIntervalListValue(env?.NSE_CHART_SNAPSHOT_INTERVALS);
    const batchSize = Math.max(1, Math.min(Number(env?.NSE_CHART_SNAPSHOT_BATCH_SIZE || 200), 550));
    const concurrency = Math.max(1, Math.min(Number(env?.NSE_CHART_SNAPSHOT_CONCURRENCY || 2), 6));

    for (const interval of intervals) {
        const window = getIntervalWindow(interval);
        const batches = [];
        for (let i = 0; i < symbols.length; i += batchSize) {
            batches.push(symbols.slice(i, i + batchSize));
        }

        let cursor = 0;
        const runWorker = async () => {
            while (cursor < batches.length) {
                const index = cursor;
                cursor += 1;
                const groupSymbols = batches[index];
                const entries = groupSymbols.map((sym) => {
                    const ex = getExchangeForSymbol(sym);
                    const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
                    return [GOOGLE_RPC_CHART, rpcArgs, null, 'generic'];
                });

                let frames = [];
                try {
                    const batchResult = await executeGoogleBatch(entries, GOOGLE_RPC_CHART);
                    frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
                } catch (error) {
                    console.error(`[Chart Snapshot] Batch failed (${interval})`, error);
                }

                const returned = new Map();
                frames.forEach((frame) => {
                    const extracted = extractWideChartFromFrame(frame.payload);
                    if (extracted?.symbol) returned.set(extracted.symbol, extracted.series);
                });

                for (const sym of groupSymbols) {
                    const series = returned.has(sym) ? returned.get(sym) : null;
                    await putSnapshotObject(
                        env,
                        `${CHART_SNAPSHOT_PREFIX}/${interval}/symbols/${sym}.json.gz`,
                        series,
                        { gzip: true, cacheControl: INTERVAL_SNAPSHOT_CACHE_CONTROL }
                    );
                }
            }
        };

        await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, runWorker));

        const intervalMeta = {
            interval,
            window,
            generatedAt: new Date().toISOString(),
            symbolCount: symbols.length,
        };

        await putSnapshotObject(
            env,
            `${CHART_SNAPSHOT_PREFIX}/${interval}/meta.json`,
            intervalMeta,
            { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL }
        );
    }

    const meta = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        intervals,
        symbolCount: symbols.length,
    };

    await putSnapshotObject(env, CHART_META_KEY, meta, { gzip: false, cacheControl: INTERVAL_META_CACHE_CONTROL });
}

async function handleIntervalSnapshotRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { error: 'R2 binding not configured' });
    }

    let key = '';
    let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;

    if (url.pathname === '/api/nse/intervals/meta') {
        key = INTERVAL_META_KEY;
        cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else {
        const match = url.pathname.match(/^\/api\/nse\/intervals\/([^/]+)\/(meta|chunks)\/?([^/]*)?$/);
        if (!match) return createJsonResponse(404, { error: 'Unknown interval route' });
        const interval = decodeURIComponent(match[1]).toUpperCase();
        const kind = match[2];
        const tail = decodeURIComponent(match[3] || '');

        if (kind === 'meta') {
            key = `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/meta.json`;
            cacheControl = INTERVAL_META_CACHE_CONTROL;
        } else {
            if (!tail) return createJsonResponse(400, { error: 'Missing chunk key' });
            key = `${INTERVAL_SNAPSHOT_PREFIX}/${interval}/chunks/${tail}.json.gz`;
        }
    }

    const object = await env.NSE_SNAPSHOTS.get(key);
    if (!object) return createJsonResponse(404, { error: 'Snapshot not found' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', cacheControl);
    headers.set('ETag', object.httpEtag);

    return new Response(request.method === 'HEAD' ? null : object.body, {
        status: 200,
        headers,
    });
}

async function handleNseSnapshotRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { error: 'R2 binding not configured' });
    }

    let key = '';
    let cacheControl = NSE_SNAPSHOT_CACHE_CONTROL;

    if (url.pathname === '/api/nse/meta') {
        key = NSE_META_KEY;
        cacheControl = NSE_META_CACHE_CONTROL;
    } else if (url.pathname.startsWith('/api/nse/chunks/')) {
        const chunkKey = decodeURIComponent(url.pathname.slice('/api/nse/chunks/'.length));
        if (!chunkKey) return createJsonResponse(400, { error: 'Missing chunk key' });
        key = `${NSE_CHUNK_PREFIX}${chunkKey}.json.gz`;
    } else {
        return createJsonResponse(404, { error: 'Unknown NSE route' });
    }

    const object = await env.NSE_SNAPSHOTS.get(key);
    if (!object) return createJsonResponse(404, { error: 'Snapshot not found' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', cacheControl);
    headers.set('ETag', object.httpEtag);

    return new Response(request.method === 'HEAD' ? null : object.body, {
        status: 200,
        headers,
    });
}

async function handlePriceSnapshotRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { error: 'R2 binding not configured' });
    }

    let key = '';
    let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;

    if (url.pathname === '/api/nse/prices/meta') {
        key = PRICE_META_KEY;
        cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else if (url.pathname.startsWith('/api/nse/prices/chunks/')) {
        const chunkKey = decodeURIComponent(url.pathname.slice('/api/nse/prices/chunks/'.length));
        if (!chunkKey) return createJsonResponse(400, { error: 'Missing chunk key' });
        key = `${PRICE_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`;
    } else {
        return createJsonResponse(404, { error: 'Unknown price snapshot route' });
    }

    const object = await env.NSE_SNAPSHOTS.get(key);
    if (!object) return createJsonResponse(404, { error: 'Snapshot not found' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', cacheControl);
    headers.set('ETag', object.httpEtag);

    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function handleFundaSnapshotRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { error: 'R2 binding not configured' });
    }

    let key = '';
    let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;

    if (url.pathname === '/api/nse/fundamentals/meta') {
        key = FUNDA_META_KEY;
        cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else if (url.pathname.startsWith('/api/nse/fundamentals/chunks/')) {
        const chunkKey = decodeURIComponent(url.pathname.slice('/api/nse/fundamentals/chunks/'.length));
        if (!chunkKey) return createJsonResponse(400, { error: 'Missing chunk key' });
        key = `${FUNDA_SNAPSHOT_PREFIX}/chunks/${chunkKey}.json.gz`;
    } else {
        return createJsonResponse(404, { error: 'Unknown fundamentals snapshot route' });
    }

    const object = await env.NSE_SNAPSHOTS.get(key);
    if (!object) return createJsonResponse(404, { error: 'Snapshot not found' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', cacheControl);
    headers.set('ETag', object.httpEtag);

    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function handleChartSnapshotRequest(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { error: 'R2 binding not configured' });
    }

    let key = '';
    let cacheControl = INTERVAL_SNAPSHOT_CACHE_CONTROL;

    if (url.pathname === '/api/nse/charts/meta') {
        key = CHART_META_KEY;
        cacheControl = INTERVAL_META_CACHE_CONTROL;
    } else {
        const match = url.pathname.match(/^\/api\/nse\/charts\/([^/]+)\/(meta|symbols)\/?([^/]*)?$/);
        if (!match) return createJsonResponse(404, { error: 'Unknown chart snapshot route' });
        const interval = decodeURIComponent(match[1]).toUpperCase();
        const kind = match[2];
        const tail = decodeURIComponent(match[3] || '');

        if (kind === 'meta') {
            key = `${CHART_SNAPSHOT_PREFIX}/${interval}/meta.json`;
            cacheControl = INTERVAL_META_CACHE_CONTROL;
        } else {
            if (!tail) return createJsonResponse(400, { error: 'Missing symbol' });
            key = `${CHART_SNAPSHOT_PREFIX}/${interval}/symbols/${tail}.json.gz`;
        }
    }

    const object = await env.NSE_SNAPSHOTS.get(key);
    if (!object) return createJsonResponse(404, { error: 'Snapshot not found' });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', cacheControl);
    headers.set('ETag', object.httpEtag);

    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function handleSnapshotHealth(request, env, url) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    if (!env?.NSE_SNAPSHOTS?.get) {
        return createJsonResponse(500, { ok: false, error: 'R2 binding not configured' });
    }

    const checks = [
        { name: 'nse', key: NSE_META_KEY },
        { name: 'intervals', key: INTERVAL_META_KEY },
        { name: 'prices', key: PRICE_META_KEY },
        { name: 'fundamentals', key: FUNDA_META_KEY },
        { name: 'charts', key: CHART_META_KEY },
    ];

    const results = {};
    const fetchedAt = new Date().toISOString();

    await Promise.all(checks.map(async (check) => {
        try {
            const object = await env.NSE_SNAPSHOTS.get(check.key);
            results[check.name] = {
                exists: Boolean(object),
                etag: object?.httpEtag || null,
                uploadedAt: object?.uploaded || null,
                size: object?.size || null,
            };
        } catch (error) {
            results[check.name] = { exists: false, error: error?.message || 'fetch failed' };
        }
    }));

    const storedRefresh = await readRefreshStatus(env);
    return createJsonResponse(200, {
        ok: true,
        fetchedAt,
        results,
        lastRefresh: storedRefresh || lastRefreshState
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
        if (!upstream.ok) return createCompressedTextResponse(request, upstream.status, text || `Upstream Error: ${upstream.status}`);
        return createCompressedTextResponse(request, 200, text);
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

async function handleWorkerVersion(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        return createMethodNotAllowedResponse('GET, HEAD');
    }
    return createJsonResponse(200, {
        ok: true,
        buildId: WORKER_BUILD_ID,
        ts: new Date().toISOString()
    });
}

async function handleSnapshotRefresh(request, env, ctx) {
    if (request.method !== 'POST') {
        return createMethodNotAllowedResponse('POST');
    }

    const expectedToken = String(env?.NSE_REFRESH_TOKEN || '').trim();
    if (!expectedToken) {
        return createJsonResponse(403, { ok: false, error: 'Refresh token not configured' });
    }

    const providedToken = request.headers.get('x-refresh-token') || '';
    if (providedToken !== expectedToken) {
        return createJsonResponse(403, { ok: false, error: 'Unauthorized' });
    }

    const origin = new URL(request.url).origin;
    const envWithOrigin = { ...env, _manualOrigin: origin };
    const startedAt = new Date().toISOString();
    lastRefreshState = {
        runId: `manual-${Date.now()}`,
        startedAt,
        finishedAt: null,
        status: 'running',
        errors: {},
    };
    await writeRefreshStatus(env, lastRefreshState);

    const runner = (async () => {
        const result = await runRefreshPipeline(envWithOrigin);
        lastRefreshState = {
            runId: result.runId,
            startedAt: result.startedAt,
            finishedAt: result.finishedAt,
            status: result.ok ? 'success' : 'error',
            errors: result.errors,
        };
    })();

    if (ctx?.waitUntil) {
        ctx.waitUntil(runner);
    } else {
        await runner;
    }

    return createJsonResponse(200, { ok: true, startedAt });
}

async function handleApi(request, env, url, ctx) {
    if (
        url.pathname === '/api/nse/meta' ||
        url.pathname.startsWith('/api/nse/chunks/')
    ) {
        return handleNseSnapshotRequest(request, env, url);
    }
    if (url.pathname === '/api/nse/intervals/meta' || url.pathname.startsWith('/api/nse/intervals/')) {
        return handleIntervalSnapshotRequest(request, env, url);
    }
    if (url.pathname === '/api/nse/prices/meta' || url.pathname.startsWith('/api/nse/prices/')) {
        return handlePriceSnapshotRequest(request, env, url);
    }
    if (url.pathname === '/api/nse/fundamentals/meta' || url.pathname.startsWith('/api/nse/fundamentals/')) {
        return handleFundaSnapshotRequest(request, env, url);
    }
    if (url.pathname === '/api/nse/charts/meta' || url.pathname.startsWith('/api/nse/charts/')) {
        return handleChartSnapshotRequest(request, env, url);
    }
    if (url.pathname === '/api/nse/health') {
        return handleSnapshotHealth(request, env, url);
    }
    if (url.pathname === '/api/version') {
        return handleWorkerVersion(request);
    }
    if (url.pathname === '/api/nse/refresh') {
        return handleSnapshotRefresh(request, env, ctx);
    }

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
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        normalizeApiPath(url);

        if (url.pathname.startsWith('/api/')) {
            return handleApi(request, env, url, ctx);
        }

        return handleStatic(request, env, url);
    },
    async scheduled(_event, env, ctx) {
        ctx.waitUntil((async () => {
            lastRefreshState = {
                runId: `scheduled-${Date.now()}`,
                startedAt: new Date().toISOString(),
                finishedAt: null,
                status: 'running',
                errors: {},
            };
            await writeRefreshStatus(env, lastRefreshState);
            const result = await runRefreshPipeline(env);
            lastRefreshState = {
                runId: result.runId,
                startedAt: result.startedAt,
                finishedAt: result.finishedAt,
                status: result.ok ? 'success' : 'error',
                errors: result.errors,
            };
        })());
    }
};
