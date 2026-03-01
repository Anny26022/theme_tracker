/**
 * Live Price Service — Maximally Batched
 */

import { EP_GOOGLE, EP_STRIKE, RPC_PRICE, RPC_CHART, RPC_FUNDA, HDR_ENTROPY, CT_PLAIN, seal } from '../lib/stealth';
import { cleanSymbol as sharedCleanSymbol } from '../../packages/core/src/symbol/cleanSymbol';
import { calculateEMA as sharedCalculateEMA, calculateSMA as sharedCalculateSMA } from '../../packages/core/src/math/indicators';

const GOOGLE_RPC_PRICE = RPC_PRICE;
const GOOGLE_RPC_CHART = RPC_CHART;
const GOOGLE_RPC_FUNDAMENTALS = RPC_FUNDA;
const GOOGLE_BATCH_PATH = EP_GOOGLE;
const MAX_BATCH_SIZE = 550; // Massively batched for maximum efficiency
const BATCH_AGGREGATION_WINDOW = 16; // 16ms (1 frame) aggregation window for instant feel
const EDGE_CACHE_MAX_URL_LENGTH = 7000;
const EDGE_REALTIME_GROUP_SIZE = 20;
const EDGE_BATCH_TTL_MS = 300_000;
const IS_DEV = import.meta.env?.DEV;
const IS_PROD = import.meta.env?.PROD === true;
const CACHE_METRICS_LOG_INTERVAL_MS = 60_000;

// ─── Persistent Caches (survive page refresh via sessionStorage) ──

const PRICE_CACHE_KEY = 'tt_price_cache:v1';
const INTERVAL_CACHE_KEY = 'tt_interval_cache:v1';
const FUNDA_CACHE_KEY = 'tt_funda_cache:v1';

const comparisonCacheMap = new Map();
const unifiedResultCache = new Map(); // timeframe:symbol -> result
const pendingUnifiedRequests = new Map();
const PRICE_CACHE_TTL = 300_000; // 5m
const FUNDA_CACHE_TTL = 3600_000; // 1 hour (fundamentals move slowly)
const MAX_PERSISTED_PRICE_ENTRIES = 1200;
const MAX_PERSISTED_INTERVAL_ENTRIES = 6000;
const MAX_PERSISTED_FUNDA_ENTRIES = 1500;

function pruneCacheEntries(cache, maxEntries) {
    if (cache.size <= maxEntries) return cache;
    const sortedEntries = [...cache.entries()].sort((a, b) => {
        const aTs = a?.[1]?.timestamp || 0;
        const bTs = b?.[1]?.timestamp || 0;
        return bTs - aTs;
    }).slice(0, maxEntries);

    cache.clear();
    sortedEntries.forEach(([key, value]) => cache.set(key, value));
    return cache;
}

// Hydrate from sessionStorage on load
function loadCache(storageKey, maxEntries) {
    try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return new Map();
            return pruneCacheEntries(new Map(parsed), maxEntries);
        }
    } catch { /* ignore corrupt data */ }
    return new Map();
}

function saveCache(cache, storageKey, maxEntries) {
    try {
        pruneCacheEntries(cache, maxEntries);
        sessionStorage.setItem(storageKey, JSON.stringify([...cache]));
    } catch { /* storage full — ignore */ }
}

const priceCache = loadCache(PRICE_CACHE_KEY, MAX_PERSISTED_PRICE_ENTRIES);
const intervalCache = loadCache(INTERVAL_CACHE_KEY, MAX_PERSISTED_INTERVAL_ENTRIES);
const fundaCache = loadCache(FUNDA_CACHE_KEY, MAX_PERSISTED_FUNDA_ENTRIES);

// Debug: log hydration on module load
if (IS_DEV) {
    console.debug(`[PriceCache] Hydrated from sessionStorage — prices: ${priceCache.size}, intervals: ${intervalCache.size}, funda: ${fundaCache.size}`);
}

// Debounced save to avoid thrashing sessionStorage
let priceSaveTimer = null;
let intervalSaveTimer = null;
let fundaSaveTimer = null;

function schedulePriceSave() {
    if (priceSaveTimer) clearTimeout(priceSaveTimer);
    priceSaveTimer = setTimeout(() => saveCache(priceCache, PRICE_CACHE_KEY, MAX_PERSISTED_PRICE_ENTRIES), 500);
}

function scheduleIntervalSave() {
    if (intervalSaveTimer) clearTimeout(intervalSaveTimer);
    intervalSaveTimer = setTimeout(() => saveCache(intervalCache, INTERVAL_CACHE_KEY, MAX_PERSISTED_INTERVAL_ENTRIES), 500);
}

function scheduleFundaSave() {
    if (fundaSaveTimer) clearTimeout(fundaSaveTimer);
    fundaSaveTimer = setTimeout(() => saveCache(fundaCache, FUNDA_CACHE_KEY, MAX_PERSISTED_FUNDA_ENTRIES), 500);
}

export const INTERVAL_WINDOWS = {
    '1D': 1, '5D': 2, '1M': 3, '3M': 4, '6M': 4,
    'YTD': 5, '1Y': 6, '5Y': 7, 'MAX': 8
};

const INTERVAL_CACHE_TTL = {
    '1D': 300_000,     // 5 min
    '5D': 300_000,     // 5 min
    '1M': 600_000,     // 10 min
    '3M': 600_000,     // 10 min
    '6M': 600_000,     // 10 min
    'YTD': 600_000,    // 10 min
    '1Y': 600_000,     // 10 min
    '5Y': 600_000,     // 10 min
    'MAX': 600_000,    // 10 min
};

function resolveEffectiveTtl(row, fallbackTtl) {
    if (row && Number.isFinite(row.ttlMs)) {
        return Math.max(0, Math.min(fallbackTtl, row.ttlMs));
    }
    return fallbackTtl;
}

function isCacheRowFresh(row, fallbackTtl) {
    if (!row) return false;
    const ttl = resolveEffectiveTtl(row, fallbackTtl);
    return Date.now() - row.timestamp < ttl;
}

function buildCacheRow(data, responseTtlMs, fallbackTtl) {
    const ttlMs = Number.isFinite(responseTtlMs)
        ? Math.max(0, Math.min(fallbackTtl, responseTtlMs))
        : fallbackTtl;
    if (ttlMs <= 0) return null;
    return { data, timestamp: Date.now(), ttlMs };
}

function getRemainingEdgeTtlMs(headers) {
    const ageHeader = headers.get('age');
    const ageSec = Number.parseFloat(ageHeader || '0');
    const safeAgeSec = Number.isFinite(ageSec) && ageSec > 0 ? ageSec : 0;
    return Math.max(0, EDGE_BATCH_TTL_MS - (safeAgeSec * 1000));
}

const cacheMetrics = {
    localHits: 0,
    localMisses: 0,
    edgeGetRequests: 0,
    edgeGetSuccess: 0,
    edgeGetFailures: 0,
    edgeServedHit: 0,
    edgeServedMiss: 0,
    edgeServedStale: 0,
    edgeServedOther: 0,
    edgeAgeSamples: 0,
    edgeAgeMsTotal: 0,
    edgeGetUrlTooLongSkips: 0,
    postFallbacks: 0,
};

let cacheMetricsLoggerStarted = false;

function incrementMetric(key, value = 1) {
    cacheMetrics[key] = (cacheMetrics[key] || 0) + value;
}

function markLocalCacheHit() {
    incrementMetric('localHits');
}

function markLocalCacheMiss() {
    incrementMetric('localMisses');
}

function markEdgeGetRequest() {
    incrementMetric('edgeGetRequests');
}

function markEdgeGetFailure() {
    incrementMetric('edgeGetFailures');
}

function markEdgeUrlTooLongSkip() {
    incrementMetric('edgeGetUrlTooLongSkips');
}

function markPostFallback() {
    incrementMetric('postFallbacks');
}

function recordEdgeResponse(headers) {
    incrementMetric('edgeGetSuccess');
    const edgeCache = (headers.get('x-vercel-cache') || '').toUpperCase();
    if (edgeCache.includes('HIT')) {
        incrementMetric('edgeServedHit');
    } else if (edgeCache.includes('MISS')) {
        incrementMetric('edgeServedMiss');
    } else if (edgeCache.includes('STALE')) {
        incrementMetric('edgeServedStale');
    } else {
        incrementMetric('edgeServedOther');
    }

    const ageSec = Number.parseFloat(headers.get('age') || '0');
    if (Number.isFinite(ageSec) && ageSec >= 0) {
        incrementMetric('edgeAgeSamples');
        incrementMetric('edgeAgeMsTotal', ageSec * 1000);
    }
}

function logCacheMetricsSnapshot() {
    const edgeAgeAvgMs = cacheMetrics.edgeAgeSamples > 0
        ? Math.round(cacheMetrics.edgeAgeMsTotal / cacheMetrics.edgeAgeSamples)
        : 0;

    console.info('[CacheMetrics][PriceService]', {
        localHits: cacheMetrics.localHits,
        localMisses: cacheMetrics.localMisses,
        edgeGetRequests: cacheMetrics.edgeGetRequests,
        edgeGetSuccess: cacheMetrics.edgeGetSuccess,
        edgeGetFailures: cacheMetrics.edgeGetFailures,
        edgeServedHit: cacheMetrics.edgeServedHit,
        edgeServedMiss: cacheMetrics.edgeServedMiss,
        edgeServedStale: cacheMetrics.edgeServedStale,
        edgeServedOther: cacheMetrics.edgeServedOther,
        edgeAgeAvgMs,
        edgeGetUrlTooLongSkips: cacheMetrics.edgeGetUrlTooLongSkips,
        postFallbacks: cacheMetrics.postFallbacks,
    });
}

function initProdCacheMetricsLogging() {
    if (!IS_PROD || cacheMetricsLoggerStarted) return;
    cacheMetricsLoggerStarted = true;

    if (typeof globalThis === 'object') {
        globalThis.__TT_CACHE_METRICS__ = cacheMetrics;
    }

    setInterval(logCacheMetricsSnapshot, CACHE_METRICS_LOG_INTERVAL_MS);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', logCacheMetricsSnapshot);
    }
}

initProdCacheMetricsLogging();

// ─── Helpers ───────────────────────────────────────────────────────

function getExchange(symbol) {
    return /^\d+$/.test(symbol) ? 'BOM' : 'NSE';
}

export const cleanSymbol = sharedCleanSymbol;

function buildBatchUrl(rpcIds) {
    return GOOGLE_BATCH_PATH;
}

/**
 * Global Request Aggregator
 * Coalesces ALL rpc calls (price, chart, funda) into one transport flush.
 */
let batchQueue = [];
let batchTimeout = null;

async function flushBatch() {
    const queue = [...batchQueue];
    batchQueue = [];
    batchTimeout = null;

    if (queue.length === 0) return;

    // Split entire queue into chunks of MAX_BATCH_SIZE
    const chunks = [];
    for (let i = 0; i < queue.length; i += MAX_BATCH_SIZE) {
        chunks.push(queue.slice(i, i + MAX_BATCH_SIZE));
    }

    // Fire ALL chunks in parallel — browser handles HTTP/2 multiplexing
    await Promise.all(chunks.map(async (chunk) => {
        const realtime = [];
        const cacheable = [];

        chunk.forEach((q, idx) => {
            if (q.entry[0] === GOOGLE_RPC_PRICE) {
                realtime.push({ q, idx });
            } else {
                cacheable.push({ q, idx });
            }
        });

        const runGroup = async (group) => {
            if (group.length === 0) return;

            const isRealtimeGroup = group[0]?.q?.entry?.[0] === GOOGLE_RPC_PRICE;
            const transportGroups = [];
            const transportChunkSize = isRealtimeGroup ? EDGE_REALTIME_GROUP_SIZE : group.length;

            for (let i = 0; i < group.length; i += transportChunkSize) {
                transportGroups.push(group.slice(i, i + transportChunkSize));
            }

            await Promise.all(transportGroups.map(async (transportGroup) => {
                const entries = transportGroup.map(item => item.q.entry);
                try {
                    const batchResult = await executeBatch(entries);
                    const frames = parseAllFrames(batchResult.text);
                    transportGroup.forEach((item, idx) => {
                        if (idx < frames.length && frames[idx]) {
                            item.q.resolve({
                                payload: frames[idx].payload,
                                responseTtlMs: batchResult.responseTtlMs
                            });
                        } else {
                            item.q.reject(new Error(`Missing frame for index ${item.idx} (got ${frames.length} frames)`));
                        }
                    });
                } catch (err) {
                    transportGroup.forEach(item => item.q.reject(err));
                }
            }));
        };

        await Promise.all([runGroup(realtime), runGroup(cacheable)]);
    }));
}

const pendingRpcRequests = new Map(); // hash -> promise

function queueRpc(rpcId, rpcArgs) {
    const hash = `${rpcId}:${rpcArgs}`;
    if (pendingRpcRequests.has(hash)) return pendingRpcRequests.get(hash);

    const promise = new Promise((resolve, reject) => {
        batchQueue.push({
            entry: [rpcId, rpcArgs, null, 'generic'],
            resolve: (val) => {
                pendingRpcRequests.delete(hash);
                resolve(val);
            },
            reject: (err) => {
                pendingRpcRequests.delete(hash);
                reject(err);
            }
        });

        if (batchQueue.length >= MAX_BATCH_SIZE) {
            if (batchTimeout) clearTimeout(batchTimeout);
            flushBatch();
        } else if (!batchTimeout) {
            batchTimeout = setTimeout(flushBatch, BATCH_AGGREGATION_WINDOW);
        }
    });

    pendingRpcRequests.set(hash, promise);
    return promise;
}

/**
 * Execute a raw batchexecute call with arbitrary entries.
 * Returns raw response text and optional CDN freshness budget.
 */
async function executeBatch(entries, timeoutMs = 12000) {
    if (entries.length === 0) return { text: '', responseTtlMs: null };

    const rpcIds = [...new Set(entries.map(e => e[0]))];
    const url = buildBatchUrl(rpcIds);
    const fReq = JSON.stringify([entries]);

    // Prefer CDN-cacheable GET transport for all batch types; fallback to POST.
    const encoded = base64UrlEncode(fReq);
    const params = new URLSearchParams({
        rpcids: rpcIds.join(','),
        f_req: encoded
    });
    const getUrl = `${url}?${params.toString()}`;

    if (getUrl.length <= EDGE_CACHE_MAX_URL_LENGTH) {
        markEdgeGetRequest();
        const getResponse = await fetch(getUrl, {
            method: 'GET',
            signal: AbortSignal.timeout?.(timeoutMs),
        });
        if (getResponse.ok) {
            recordEdgeResponse(getResponse.headers);
            return {
                text: await getResponse.text(),
                responseTtlMs: getRemainingEdgeTtlMs(getResponse.headers)
            };
        }
        markEdgeGetFailure();
        if (IS_DEV) {
            console.warn(`[PriceService] Edge GET batch failed (${getResponse.status}), falling back to POST`);
        }
    } else if (IS_DEV) {
        console.warn(`[PriceService] Edge GET skipped: URL too long (${getUrl.length})`);
    } else {
        markEdgeUrlTooLongSkip();
    }

    // Fallback path: AES-256-GCM encrypted POST payload
    markPostFallback();
    const entropy = await seal(fReq);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            [HDR_ENTROPY]: rpcIds.join(','),
            'Content-Type': CT_PLAIN
        },
        body: entropy,
        signal: AbortSignal.timeout?.(timeoutMs),
    });

    if (!response.ok) throw new Error(`Batch failed: ${response.status}`);
    return { text: await response.text(), responseTtlMs: null };
}

function base64UrlEncode(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Parse all wrb.fr frames from a batchexecute response.
 * Returns array of { rpcId, payload } in sequential order.
 *
 * Parses raw batchexecute response into individual frames.
 */
function parseAllFrames(text) {
    const frames = [];
    const lines = text.split('\n');

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
                } catch { /* skip unparseable payloads */ }
            }
        } catch { continue; }
    }

    return frames;
}

// ─── Price Extraction ──────────────────────────────────────────────

function extractPriceFromFrame(payload) {
    const quote = payload?.[0]?.[0]?.[0];
    if (!Array.isArray(quote)) return null;

    const symbolInfo = quote[1];   // ["RELIANCE", "NSE"]
    const priceTuple = quote[5];   // [price, change, changePct, ...]
    const prevClose = quote[7];

    if (!Array.isArray(priceTuple) || typeof priceTuple[0] !== 'number') return null;
    if (!Array.isArray(symbolInfo)) return null;

    return {
        symbol: symbolInfo[0],
        data: {
            price: priceTuple[0],
            change: priceTuple[1] || 0,
            changePct: priceTuple[2] || 0,
            prevClose: prevClose || 0,
            source: 'google'
        }
    };
}

// ─── Chart/Interval Extraction ─────────────────────────────────────

function extractChartFromFrame(payload, interval) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0]; // ["RELIANCE", "NSE"]

    // Robustly find the points array. Google structure varies.
    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }

    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || points.length === 0) return null;

    const lastPoint = points[points.length - 1];
    const close = lastPoint?.[1]?.[0];
    let changePct = lastPoint?.[1]?.[2];

    // Compute custom intervals requiring manual lookback
    if (interval === '3M') {
        const lookback = 63; // ~63 trading days in 3 months
        const startIndex = Math.max(0, points.length - 1 - lookback);
        const startPrice = points[startIndex]?.[1]?.[0];
        if (startPrice && close) {
            changePct = ((close - startPrice) / startPrice);
        }
    }

    if (typeof changePct !== 'number' || !isFinite(changePct)) return null;

    return {
        symbol: symbolInfo[0],
        data: { changePct: changePct * 100, close }
    };
}

/**
 * Extract FULL time-series from chart frame.
 */
function extractWideChartFromFrame(payload) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];

    // Robustly find the points array. Google structure varies.
    // 1D: root[3][0][1]
    // 1M+: root[3][1]
    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }

    if (!Array.isArray(points) || points.length === 0) return null;

    // Convert internal date array [Y,M,D,H,m...] to timestamp
    const parseTime = (val) => {
        if (typeof val === 'number') return val;
        if (Array.isArray(val)) {
            // [2026, 2, 24, 15, 30] -> timestamp
            const [y, m, d, h, min] = val;
            return new Date(y, m - 1, d, h || 0, min || 0).getTime();
        }
        return 0;
    };

    const series = points.map(p => ({
        time: parseTime(p[0]),
        changePct: (p?.[1]?.[2] || 0) * 100,
        price: p?.[1]?.[0] || 0
    })).filter(p => isFinite(p.changePct) && p.time > 0)
        .sort((a, b) => a.time - b.time);

    // Normalize value to changePct for chart compatibility 
    series.forEach(p => { p.value = p.changePct; });

    // Normalize to start at 0% if we have points
    if (series.length > 0) {
        const startVal = series[0].value;
        series.forEach(p => { p.value -= startVal; });
    }

    return {
        symbol: symbolInfo[0],
        series
    };
}

// ─── Strike Fallback (NSE only) ────────────────────────────────────

async function fetchFromStrike(symbol) {
    const clean = cleanSymbol(symbol);
    if (/^\d+$/.test(clean)) return null; // BSE — Strike doesn't support

    const encoded = `EQ%3A${clean}`;
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}%3A${pad(now.getMinutes())}%3A${pad(now.getSeconds())}%2B05%3A30`;
    const fromStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T09%3A15%3A00%2B05%3A30`;

    for (const base of [EP_STRIKE]) {
        try {
            const payload = await seal(JSON.stringify({
                fromStr, toStr, encoded,
                path: '/v2/api/equity/priceticks'
            }));

            const response = await fetch(base, {
                method: 'POST',
                headers: { 'Content-Type': CT_PLAIN },
                body: payload,
                signal: AbortSignal.timeout?.(15000),
            });
            if (!response.ok) continue;

            const data = await response.json();
            const ticks = data?.data?.ticks?.[clean] || data?.data?.ticks?.[symbol.toUpperCase()];
            if (!ticks?.length) continue;

            const last = ticks[ticks.length - 1];
            const close = last[4], open = last[1];
            if (typeof close === 'number' && close > 0) {
                return {
                    price: close,
                    change: close - open,
                    changePct: open > 0 ? ((close - open) / open) * 100 : 0,
                    prevClose: open,
                    source: 'strike'
                };
            }
        } catch { continue; }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch live prices for ALL symbols in ONE HTTP call per 25.
 * @param {string[]} symbols
 * @returns {Map<string, priceData>}
 */
export async function fetchLivePrices(symbols) {
    const keys = symbols.map(s => cleanSymbol(s));
    const results = new Map();

    // Check cache first
    const uncached = [];
    for (const key of keys) {
        const cached = priceCache.get(key);
        if (isCacheRowFresh(cached, PRICE_CACHE_TTL)) {
            markLocalCacheHit();
            results.set(key, cached.data);
        } else {
            markLocalCacheMiss();
            uncached.push(key);
        }
    }

    if (IS_DEV) {
        console.debug(`[PriceCache] PRICES — ✅ ${results.size} cache hits, ❌ ${uncached.length} cache misses`, uncached.length ? uncached.slice(0, 5).join(', ') + (uncached.length > 5 ? '...' : '') : '');
    }

    if (uncached.length === 0) return results;

    // Batch using the Dispatcher
    const requests = uncached.map(sym => {
        const ex = getExchange(sym);
        const rpcArgs = JSON.stringify([[[null, [sym, ex]]], 1]);
        return queueRpc(GOOGLE_RPC_PRICE, rpcArgs).then(({ payload, responseTtlMs }) => {
            const extracted = extractPriceFromFrame(payload);
            if (extracted) {
                results.set(extracted.symbol, extracted.data);
                const row = buildCacheRow(extracted.data, responseTtlMs, PRICE_CACHE_TTL);
                if (row) priceCache.set(extracted.symbol, row);
            }
        });
    });

    try {
        await Promise.all(requests);
        schedulePriceSave();
    } catch (err) {
        console.warn('[PriceService] Price queue failed:', err.message);
    }

    // Aggressive Parallel Fallback for Indian stocks (NSE)
    // If Google hasn't returned in 1.5s, fire Strike in parallel and race them.
    const missing = uncached.filter(s => !results.has(s) && !/^\d+$/.test(s));
    if (missing.length > 0) {
        await Promise.allSettled(missing.map(async (sym) => {
            // We don't wait for Google to time out. If we hit this point, 
            // any remaining 'requests' are taking too long.
            const data = await fetchFromStrike(sym);
            if (data && !results.has(sym)) {
                results.set(sym, data);
                const row = buildCacheRow(data, null, PRICE_CACHE_TTL);
                if (row) priceCache.set(sym, row);
                schedulePriceSave();
            }
        }));
    }

    return results;
}

/**
 * Fetch live price for a single symbol.
 */
export async function fetchLivePrice(symbol) {
    const map = await fetchLivePrices([symbol]);
    return map.get(cleanSymbol(symbol)) || null;
}

/**
 * Fetch interval change % for ALL symbols in batches of 25.
 * ONE call per 25 symbols instead of 1 per symbol.
 * 
 * @param {string[]} symbols
 * @param {string} interval - '1D','5D','1M','6M','YTD','1Y','5Y','MAX'
 * @returns {Map<string, { changePct, close }>}
 */
// ─── Consolidated Interval Fetching ────────────────────────────────

const pendingIntervalReqs = new Map(); // timeframe:window -> Map<symbol, Promise>
const intervalWaitTimers = new Map(); // timeframe:window -> timer

/**
 * Fetch interval change % for MANY symbols.
 * Consolidation: Merges multiple calls in the same tick into a single set of parallel batches.
 */
export function fetchBatchIntervalPerformance(symbols, interval = '1M') {
    const window = INTERVAL_WINDOWS[interval] || 3;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const cacheKeyBase = `${interval}:${window}`;

    if (!pendingIntervalReqs.has(cacheKeyBase)) {
        pendingIntervalReqs.set(cacheKeyBase, new Map());
    }
    const currentPending = pendingIntervalReqs.get(cacheKeyBase);

    // 1. Filter out already cached symbols
    const uncached = [];
    const results = new Map();

    for (const raw of symbols) {
        const sym = cleanSymbol(raw);
        const cacheKey = `${sym}:${window}`;
        const cached = intervalCache.get(cacheKey);

        if (isCacheRowFresh(cached, ttl)) {
            markLocalCacheHit();
            if (cached.data !== null) results.set(sym, cached.data);
        } else if (!currentPending.has(sym)) {
            markLocalCacheMiss();
            uncached.push(sym);
        }
    }

    if (uncached.length === 0) {
        // All either cached or already pending. 
        // We need to wait for pending ones if some are requested.
        return new Promise(async (resolve) => {
            const requestedPending = symbols.map(s => cleanSymbol(s)).filter(s => currentPending.has(s));
            if (requestedPending.length > 0) {
                await Promise.all(requestedPending.map(s => currentPending.get(s)));
                // Re-read from cache/results
                symbols.forEach(s => {
                    const sym = cleanSymbol(s);
                    const cacheKey = `${sym}:${window}`;
                    const c = intervalCache.get(cacheKey);
                    if (c?.data) results.set(sym, c.data);
                });
            }
            resolve(results);
        });
    }

    // 2. Create promises for the new symbols
    let resolveBatch;
    const batchPromise = new Promise(res => { resolveBatch = res; });
    uncached.forEach(sym => currentPending.set(sym, batchPromise));

    // 3. Schedule the execution
    if (intervalWaitTimers.has(cacheKeyBase)) clearTimeout(intervalWaitTimers.get(cacheKeyBase));

    intervalWaitTimers.set(cacheKeyBase, setTimeout(async () => {
        intervalWaitTimers.delete(cacheKeyBase);

        // Final list of ALL symbols waiting for this specific timeframe
        const allUncached = Array.from(currentPending.keys()).filter(s => {
            const cacheKey = `${s}:${window}`;
            const c = intervalCache.get(cacheKey);
            return !isCacheRowFresh(c, ttl);
        });

        if (allUncached.length === 0) {
            resolveBatch();
            return;
        }

        if (IS_DEV) {
            console.debug(`[PriceService] Consolidating Interval ${interval} — Batching ${allUncached.length} symbols`);
        }

        // Larger batch size for performance charts (small payload)
        const CHUNK_SIZE = 550;
        const chunks = [];
        for (let i = 0; i < allUncached.length; i += CHUNK_SIZE) {
            chunks.push(allUncached.slice(i, i + CHUNK_SIZE));
        }

        // Parallelize all chunks
        await Promise.all(chunks.map(async (chunk) => {
            const entries = chunk.map(sym => {
                const ex = getExchange(sym);
                const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
                return [GOOGLE_RPC_CHART, rpcArgs, null, 'generic'];
            });

            try {
                const batchResult = await executeBatch(entries);
                const frames = parseAllFrames(batchResult.text).filter(f => f.rpcId === GOOGLE_RPC_CHART);
                const returned = new Set();

                frames.forEach(frame => {
                    const extracted = extractChartFromFrame(frame.payload, interval);
                    if (extracted) {
                        const cacheKey = `${extracted.symbol}:${window}`;
                        const row = buildCacheRow(extracted.data, batchResult.responseTtlMs, ttl);
                        if (row) intervalCache.set(cacheKey, row);
                        returned.add(extracted.symbol);
                    }
                });

                // Negative cache
                chunk.forEach(sym => {
                    if (!returned.has(sym)) {
                        const row = buildCacheRow(null, batchResult.responseTtlMs, ttl);
                        if (row) intervalCache.set(`${sym}:${window}`, row);
                    }
                });
            } catch (err) {
                console.warn(`[PriceService] Parallel chunk failed:`, err.message);
            }
        }));

        scheduleIntervalSave();
        currentPending.clear(); // Clear pending map for this timeframe
        resolveBatch();
    }, 50)); // 50ms window to aggregate hook calls

    // Return results merged with any pending data
    return batchPromise.then(() => {
        symbols.forEach(s => {
            const sym = cleanSymbol(s);
            const cacheKey = `${sym}:${window}`;
            const c = intervalCache.get(cacheKey);
            if (c?.data) results.set(sym, c.data);
        });
        return results;
    });
}

/**
 * Unified Data Engine: Fetches 1Y chart data once and derives ALL metrics (perf + technicals).
 * @param {string[]} symbols 
 * @param {string} interval 
 */
export async function fetchUnifiedTrackerData(symbols, interval = '1M') {
    const keys = [...new Set(symbols.map(s => cleanSymbol(s)))];
    const requestKey = `${interval}:${[...keys].sort().join(',')}`;
    const pending = pendingUnifiedRequests.get(requestKey);
    if (pending) return pending;

    const requestPromise = (async () => {
        const results = new Map();
        const uncachedKeys = [];

        // 1. Check Unified Result Cache (Calculated EMA/Perf)
        keys.forEach(sym => {
            const cacheKey = `${interval}:${sym}`;
            const cached = unifiedResultCache.get(cacheKey);
            // Unified results expire every 5 mins
            if (isCacheRowFresh(cached, 300_000)) {
                markLocalCacheHit();
                results.set(sym, cached.data);
            } else {
                markLocalCacheMiss();
                uncachedKeys.push(sym);
            }
        });

        if (uncachedKeys.length === 0) return results;

        // 2. We reuse fetchComparisonCharts which already batches and caches 1Y data
        const charts = await fetchComparisonCharts(uncachedKeys, '1Y');

        uncachedKeys.forEach(sym => {
            const series = charts.get(sym);
            if (!series || series.length < 5) return;

            const prices = series.map(p => p.price).filter(p => p > 0);
            if (prices.length < 5) return;

            const currentPrice = prices[prices.length - 1];
            let changePct = 0;

            const dayIndices = { '1D': 1, '5D': 5, '1M': 20, '3M': 63, '6M': 125, '1Y': 250, 'YTD': 250 };
            const lookback = dayIndices[interval] || 20;
            const startIndex = Math.max(0, prices.length - 1 - lookback);
            const startPrice = prices[startIndex];

            if (startPrice > 0) {
                changePct = ((currentPrice - startPrice) / startPrice) * 100;
            }

            const ema10 = calculateEMA(prices, 10);
            const ema21 = calculateEMA(prices, 21);
            const ema50 = calculateEMA(prices, 50);
            const ema150 = calculateEMA(prices, 150);
            const ema200 = calculateEMA(prices, 200);

            const data = {
                perf: { changePct, close: currentPrice },
                breadth: {
                    above10EMA: ema10 !== null ? currentPrice > ema10 : false,
                    above21EMA: ema21 !== null ? currentPrice > ema21 : false,
                    above50EMA: ema50 !== null ? currentPrice > ema50 : false,
                    above150EMA: ema150 !== null ? currentPrice > ema150 : false,
                    above200EMA: ema200 !== null ? currentPrice > ema200 : false,
                    ema10,
                    ema21,
                    ema50,
                    ema150,
                    ema200
                }
            };

            const row = buildCacheRow(data, null, 300_000);
            if (row) unifiedResultCache.set(`${interval}:${sym}`, row);
            results.set(sym, data);
        });

        return results;
    })();

    pendingUnifiedRequests.set(requestKey, requestPromise);
    try {
        return await requestPromise;
    } finally {
        pendingUnifiedRequests.delete(requestKey);
    }
}

// ─── Fundamentals Extraction ────────────────────────────────────────

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

/**
 * Fetch fundamental data for one or more symbols.
 * Since fundamentals are heavy, we only fetch on demand.
 */
export async function fetchFundamentals(symbols) {
    const keys = symbols.map(s => cleanSymbol(s));
    const results = new Map();
    const uncached = [];

    for (const key of keys) {
        const cached = fundaCache.get(key);
        if (isCacheRowFresh(cached, FUNDA_CACHE_TTL)) {
            markLocalCacheHit();
            results.set(key, cached.data);
        } else {
            markLocalCacheMiss();
            uncached.push(key);
        }
    }

    if (uncached.length === 0) return results;

    for (let i = 0; i < uncached.length; i += MAX_BATCH_SIZE) {
        const chunk = uncached.slice(i, i + MAX_BATCH_SIZE);
        const entries = chunk.map(sym => {
            const ex = getExchange(sym);
            const rpcArgs = JSON.stringify([[[null, [sym, ex]]]]); // Verified 4-bracket nesting
            return [GOOGLE_RPC_FUNDAMENTALS, rpcArgs, null, 'generic'];
        });

        try {
            const batchResult = await executeBatch(entries);
            const frames = parseAllFrames(batchResult.text).filter(f => f.rpcId === GOOGLE_RPC_FUNDAMENTALS);

            // Google returns frames in request order for the same RPC ID
            for (let j = 0; j < chunk.length; j++) {
                const frame = frames[j];
                const symbol = chunk[j];
                if (!frame) continue;

                const extracted = extractFundaFromFrame(frame.payload);
                if (extracted) {
                    results.set(symbol, extracted);
                    const row = buildCacheRow(extracted, batchResult.responseTtlMs, FUNDA_CACHE_TTL);
                    if (row) fundaCache.set(symbol, row);
                }
            }
            scheduleFundaSave();
        } catch (err) {
            console.warn('[PriceService] Fundamentals batch failed:', err.message);
        }
    }

    return results;
}

/**
 * Comparison Engine: Fetch full chart series for multiple symbols.
 * These are not cached in sessionStorage to avoid bloat.
 */

export async function fetchComparisonCharts(symbols, interval = '1D') {
    const window = INTERVAL_WINDOWS[interval] || 1;
    const results = new Map();
    const uncached = [];

    for (const raw of symbols) {
        const sym = cleanSymbol(raw);
        const cacheKey = `${sym}:${window}:full`;
        const cached = comparisonCacheMap.get(cacheKey);
        // Full charts expire faster (2 min)
        if (isCacheRowFresh(cached, 120_000)) {
            markLocalCacheHit();
            results.set(sym, cached.series);
        } else {
            markLocalCacheMiss();
            uncached.push(sym);
        }
    }

    if (uncached.length === 0) return results;

    // Use dispatcher for Comparison Charts
    const requests = uncached.map(sym => {
        const ex = getExchange(sym);
        const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
        return queueRpc(GOOGLE_RPC_CHART, rpcArgs).then(({ payload, responseTtlMs }) => {
            const extracted = extractWideChartFromFrame(payload);
            if (extracted) {
                const cacheKey = `${extracted.symbol}:${window}:full`;
                const row = buildCacheRow(extracted.series, responseTtlMs, 120_000);
                if (row) comparisonCacheMap.set(cacheKey, { series: row.data, timestamp: row.timestamp, ttlMs: row.ttlMs });
                results.set(extracted.symbol, extracted.series);
            }
        });
    });

    try {
        await Promise.all(requests);
    } catch (err) {
        console.warn('[PriceService] Comparison queue failed:', err.message);
    }

    return results;
}

/**
 * Clear all caches.
 */
export function clearPriceCache() {
    priceCache.clear();
    intervalCache.clear();
    fundaCache.clear();
    sessionStorage.removeItem(PRICE_CACHE_KEY);
    sessionStorage.removeItem(INTERVAL_CACHE_KEY);
    sessionStorage.removeItem(FUNDA_CACHE_KEY);
}

/**
 * Read cached interval data synchronously (no fetch).
 * Returns { changePct, close } or null if not cached/expired.
 */
export function getCachedInterval(symbol, interval) {
    const key = cleanSymbol(symbol);
    const window = INTERVAL_WINDOWS[interval] || 3;
    const cacheKey = `${key}:${window}`;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const cached = intervalCache.get(cacheKey);
    if (isCacheRowFresh(cached, ttl)) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss();
    return null;
}

/**
 * Read cached price data synchronously (no fetch).
 */
export function getCachedPrice(symbol) {
    const key = cleanSymbol(symbol);
    const cached = priceCache.get(key);
    if (isCacheRowFresh(cached, PRICE_CACHE_TTL)) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss();
    return null;
}
// ─── Technical Breadth & Indicators ────────────────────────────────

/**
 * Calculate Simple Moving Average
 */
export const calculateSMA = sharedCalculateSMA;

/**
 * Calculate Exponential Moving Average
 */
export const calculateEMA = sharedCalculateEMA;

/**
 * Fetch technical breadth for multiple symbols.
 * Returns % of stocks above specific MAs.
 */
export async function fetchTechnicalBreadth(symbols) {
    const keys = symbols.map(s => cleanSymbol(s));
    const charts = await fetchComparisonCharts(keys, '1Y');

    let above21EMA = 0;
    let above50SMA = 0;
    let above150SMA = 0;
    let above200SMA = 0;
    let validCount = 0;

    keys.forEach(sym => {
        const series = charts.get(sym);
        if (!series || series.length < 5) return;

        const prices = series.map(p => p.price).filter(p => p > 0);
        if (prices.length < 20) return;

        const currentPrice = prices[prices.length - 1];

        const ema21 = calculateEMA(prices, 21);
        const sma50 = calculateSMA(prices, 50);
        const sma150 = calculateSMA(prices, 150);
        const sma200 = calculateSMA(prices, 200);

        if (ema21 && currentPrice > ema21) above21EMA++;
        if (sma50 && currentPrice > sma50) above50SMA++;
        if (sma150 && currentPrice > sma150) above150SMA++;
        if (sma200 && currentPrice > sma200) above200SMA++;

        validCount++;
    });

    return {
        above21EMA: validCount > 0 ? (above21EMA / validCount) * 100 : 0,
        above50SMA: validCount > 0 ? (above50SMA / validCount) * 100 : 0,
        above150SMA: validCount > 0 ? (above150SMA / validCount) * 100 : 0,
        above200SMA: validCount > 0 ? (above200SMA / validCount) * 100 : 0,
        validCount,
        total: symbols.length
    };
}
