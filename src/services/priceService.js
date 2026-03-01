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
const EDGE_CACHEABLE_GROUP_SIZE = 25;
const EDGE_BATCH_TTL_MS = 300_000;
const EDGE_BATCH_TIMEOUT_MS = 15_000;
const EDGE_BATCH_RETRIES = 1;
const EDGE_BATCH_RETRY_BACKOFF_MS = 180;
const INTERVAL_CHUNK_CONCURRENCY = 4;
const INTERVAL_RETRY_CHUNK_CONCURRENCY = 2;
const INTERVAL_RETRY_CHUNK_SIZE = 120;
const INTERVAL_NEGATIVE_CACHE_TTL_MS = 30_000;
const IS_DEV = import.meta.env?.DEV;
const IS_PROD = import.meta.env?.PROD === true;
const CACHE_METRICS_LOG_INTERVAL_MS = 60_000;
const INTERVAL_SOURCE_LOG_INTERVAL_MS = 15_000;
const CACHE_METRICS_STATE_KEY = 'tt_cache_metrics_state:v1';
const MARKET_PHASE_STATE_KEY = 'tt_market_phase_state:v1';
const IST_TIME_ZONE = 'Asia/Kolkata';
const MONDAY_OPEN_TOTAL_MINUTES = (9 * 60) + 15;
const IST_WEEKDAY_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const IST_MARKET_PARTS_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

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
const MAX_PERSISTED_INTERVAL_ENTRIES_IDB = 30000;
const MAX_PERSISTED_INTERVAL_ENTRIES_SESSION = 500;
const MAX_INTERVAL_MEMORY_ENTRIES = 40000;
const MAX_PERSISTED_FUNDA_ENTRIES = 1500;
const INTERVAL_CACHE_DB_NAME = 'tt_cache_db';
const INTERVAL_CACHE_DB_VERSION = 1;
const INTERVAL_CACHE_STORE = 'kv';
const INTERVAL_CACHE_IDB_KEY = 'interval_cache_v1';
const HAS_INDEXED_DB = typeof indexedDB !== 'undefined';

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

function getSortedCacheEntries(cache) {
    return [...cache.entries()].sort((a, b) => {
        const aTs = a?.[1]?.timestamp || 0;
        const bTs = b?.[1]?.timestamp || 0;
        return bTs - aTs;
    });
}

let intervalCacheDbPromise = null;
let intervalCacheHydrated = false;
let intervalCacheHydrationPromise = null;
const idbHydratedIntervalKeys = new Set();
const sessionHydratedIntervalKeys = new Set();
let intervalSourceLastLogAt = 0;
const intervalSourceAccumulator = {
    calls: 0,
    symbols: 0,
    idbHits: 0,
    sessionHits: 0,
    memoryHits: 0,
    misses: 0,
};

function flushIntervalSourceLog(force = false) {
    const now = Date.now();
    if (!force && now - intervalSourceLastLogAt < INTERVAL_SOURCE_LOG_INTERVAL_MS) return;
    if (intervalSourceAccumulator.calls === 0) return;

    intervalSourceLastLogAt = now;
    console.info('[PriceService][IntervalCacheSource]', {
        at: new Date(now).toISOString(),
        calls: intervalSourceAccumulator.calls,
        symbols: intervalSourceAccumulator.symbols,
        idbHits: intervalSourceAccumulator.idbHits,
        sessionHits: intervalSourceAccumulator.sessionHits,
        memoryHits: intervalSourceAccumulator.memoryHits,
        misses: intervalSourceAccumulator.misses,
    });

    intervalSourceAccumulator.calls = 0;
    intervalSourceAccumulator.symbols = 0;
    intervalSourceAccumulator.idbHits = 0;
    intervalSourceAccumulator.sessionHits = 0;
    intervalSourceAccumulator.memoryHits = 0;
    intervalSourceAccumulator.misses = 0;
}

function recordIntervalSourceSample({ symbols = 0, idbHits = 0, sessionHits = 0, memoryHits = 0, misses = 0 }) {
    intervalSourceAccumulator.calls += 1;
    intervalSourceAccumulator.symbols += symbols;
    intervalSourceAccumulator.idbHits += idbHits;
    intervalSourceAccumulator.sessionHits += sessionHits;
    intervalSourceAccumulator.memoryHits += memoryHits;
    intervalSourceAccumulator.misses += misses;
    flushIntervalSourceLog();
}

function openIntervalCacheDb() {
    if (!HAS_INDEXED_DB) return Promise.resolve(null);
    if (intervalCacheDbPromise) return intervalCacheDbPromise;

    intervalCacheDbPromise = new Promise((resolve) => {
        try {
            const request = indexedDB.open(INTERVAL_CACHE_DB_NAME, INTERVAL_CACHE_DB_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(INTERVAL_CACHE_STORE)) {
                    db.createObjectStore(INTERVAL_CACHE_STORE);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });

    return intervalCacheDbPromise;
}

async function readIntervalCacheEntriesFromIndexedDb() {
    const db = await openIntervalCacheDb();
    if (!db) return null;

    return new Promise((resolve) => {
        try {
            const tx = db.transaction(INTERVAL_CACHE_STORE, 'readonly');
            const store = tx.objectStore(INTERVAL_CACHE_STORE);
            const request = store.get(INTERVAL_CACHE_IDB_KEY);
            request.onsuccess = () => {
                const value = request.result;
                resolve(Array.isArray(value?.entries) ? value.entries : null);
            };
            request.onerror = () => resolve(null);
        } catch {
            resolve(null);
        }
    });
}

async function writeIntervalCacheEntriesToIndexedDb(entries) {
    const db = await openIntervalCacheDb();
    if (!db) return;

    await new Promise((resolve) => {
        try {
            const tx = db.transaction(INTERVAL_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(INTERVAL_CACHE_STORE);
            store.put({ entries, updatedAt: Date.now() }, INTERVAL_CACHE_IDB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

async function clearIntervalCacheFromIndexedDb() {
    const db = await openIntervalCacheDb();
    if (!db) return;

    await new Promise((resolve) => {
        try {
            const tx = db.transaction(INTERVAL_CACHE_STORE, 'readwrite');
            const store = tx.objectStore(INTERVAL_CACHE_STORE);
            store.delete(INTERVAL_CACHE_IDB_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        } catch {
            resolve();
        }
    });
}

const priceCache = loadCache(PRICE_CACHE_KEY, MAX_PERSISTED_PRICE_ENTRIES);
const intervalCache = loadCache(INTERVAL_CACHE_KEY, MAX_PERSISTED_INTERVAL_ENTRIES_SESSION);
const fundaCache = loadCache(FUNDA_CACHE_KEY, MAX_PERSISTED_FUNDA_ENTRIES);
intervalCache.forEach((_, key) => sessionHydratedIntervalKeys.add(key));

async function hydrateIntervalCacheFromIndexedDb() {
    const startedAt = Date.now();
    let hydratedEntries = 0;
    try {
        const entries = await readIntervalCacheEntriesFromIndexedDb();
        if (Array.isArray(entries)) {
            hydratedEntries = entries.length;
            entries.forEach(([key, row]) => {
                if (!key || !row || typeof row.timestamp !== 'number') return;
                const existing = intervalCache.get(key);
                const existingTs = existing?.timestamp || 0;
                if (!existing || row.timestamp > existingTs) {
                    intervalCache.set(key, row);
                    idbHydratedIntervalKeys.add(key);
                    sessionHydratedIntervalKeys.delete(key);
                }
            });
            pruneCacheEntries(intervalCache, MAX_INTERVAL_MEMORY_ENTRIES);
        }
    } finally {
        cacheMetrics.idbHydrationRuns = (cacheMetrics.idbHydrationRuns || 0) + 1;
        if (hydratedEntries > 0) {
            cacheMetrics.idbHydrationHitLoads = (cacheMetrics.idbHydrationHitLoads || 0) + 1;
        } else {
            cacheMetrics.idbHydrationMissLoads = (cacheMetrics.idbHydrationMissLoads || 0) + 1;
        }
        cacheMetrics.idbHydrationMs = Math.max(0, Date.now() - startedAt);
        cacheMetrics.idbHydrationEntries = hydratedEntries;
        console.info('[PriceService][IDB] Interval hydration', {
            entries: hydratedEntries,
            ms: cacheMetrics.idbHydrationMs,
            usedIdb: hydratedEntries > 0
        });
        intervalCacheHydrated = true;
    }
}

function ensureIntervalCacheHydrated() {
    if (intervalCacheHydrated) return Promise.resolve();
    if (!intervalCacheHydrationPromise) {
        intervalCacheHydrationPromise = hydrateIntervalCacheFromIndexedDb();
    }
    return intervalCacheHydrationPromise;
}

ensureIntervalCacheHydrated();

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
    intervalSaveTimer = setTimeout(() => {
        pruneCacheEntries(intervalCache, MAX_INTERVAL_MEMORY_ENTRIES);
        const idbEntries = getSortedCacheEntries(intervalCache).slice(0, MAX_PERSISTED_INTERVAL_ENTRIES_IDB);
        void writeIntervalCacheEntriesToIndexedDb(idbEntries);
        const sessionMirror = new Map(idbEntries.slice(0, MAX_PERSISTED_INTERVAL_ENTRIES_SESSION));
        saveCache(sessionMirror, INTERVAL_CACHE_KEY, MAX_PERSISTED_INTERVAL_ENTRIES_SESSION);
    }, 500);
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

function getIntervalCacheKey(symbol, interval, window) {
    return `${symbol}:${interval}:${window}`;
}

function getLegacyIntervalCacheKey(symbol, window) {
    return `${symbol}:${window}`;
}

function getIntervalRowTtl(row, ttl) {
    if (row?.data === null) {
        return Math.min(ttl, INTERVAL_NEGATIVE_CACHE_TTL_MS);
    }
    return ttl;
}

function isIntervalRowFresh(row, ttl) {
    return isCacheRowFresh(row, getIntervalRowTtl(row, ttl));
}

function resolveIntervalCacheRecord(symbol, interval, window) {
    const primaryKey = getIntervalCacheKey(symbol, interval, window);
    const primary = intervalCache.get(primaryKey);
    if (primary) return { cacheKey: primaryKey, cached: primary };

    const legacyKey = getLegacyIntervalCacheKey(symbol, window);
    const legacy = intervalCache.get(legacyKey);
    if (!legacy) return { cacheKey: primaryKey, cached: null };

    intervalCache.set(primaryKey, legacy);
    intervalCache.delete(legacyKey);
    if (idbHydratedIntervalKeys.delete(legacyKey)) idbHydratedIntervalKeys.add(primaryKey);
    if (sessionHydratedIntervalKeys.delete(legacyKey)) sessionHydratedIntervalKeys.add(primaryKey);
    return { cacheKey: primaryKey, cached: legacy };
}

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
    cacheLookupMisses: 0,
    missReasonCold: 0,
    missReasonTtlExpired: 0,
    missReasonKeyVariant: 0,
    missReasonUrlTooLong: 0,
    missReasonPostFallback: 0,
    networkMissBatches: 0,
    edgeGetEligibleBatches: 0,
    edgeGetExecutedBatches: 0,
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
    externalCacheHits: 0,
    externalCacheMisses: 0,
    heatmapMemoHits: 0,
    heatmapMemoMisses: 0,
    heatmapFreshServes: 0,
    heatmapScheduledRefreshes: 0,
    idbHydrationMs: 0,
    idbHydrationEntries: 0,
    idbHydrationRuns: 0,
    idbHydrationHitLoads: 0,
    idbHydrationMissLoads: 0,
    intervalLocalHitsFromIdb: 0,
    intervalLocalHitsFromSession: 0,
    intervalLocalHitsFromMemory: 0,
    intervalLocalHitsFromMemorySession: 0,
    marketBoundaryPurges: 0,
    appLoads: 0,
};

let cacheMetricsLoggerStarted = false;
let previousLoggedCounters = null;
let edgeUrlTooLongWarnCount = 0;
let edgeUrlTooLongWarnLastAt = 0;
const EDGE_REQUEST_FINGERPRINT_LIMIT = 30000;
const EDGE_ENTRY_FINGERPRINT_LIMIT = 60000;
const edgeRequestFingerprints = new Map();
const edgeEntryFingerprints = new Map();

function incrementMetric(key, value = 1) {
    cacheMetrics[key] = (cacheMetrics[key] || 0) + value;
}

function normalizeMissReason(reason) {
    if (reason === 'ttl-expired') return 'ttl-expired';
    if (reason === 'key-variant') return 'key-variant';
    if (reason === 'url-too-long') return 'url-too-long';
    if (reason === 'post-fallback') return 'post-fallback';
    return 'cold';
}

function markMissReason(reason) {
    const normalized = normalizeMissReason(reason);
    if (normalized === 'cold') incrementMetric('missReasonCold');
    if (normalized === 'ttl-expired') incrementMetric('missReasonTtlExpired');
    if (normalized === 'key-variant') incrementMetric('missReasonKeyVariant');
    if (normalized === 'url-too-long') incrementMetric('missReasonUrlTooLong');
    if (normalized === 'post-fallback') incrementMetric('missReasonPostFallback');
}

function cacheLookupMissReason(cachedRow) {
    return cachedRow ? 'ttl-expired' : 'cold';
}

export function recordCacheMetric(key, value = 1) {
    if (!Object.prototype.hasOwnProperty.call(cacheMetrics, key)) return;
    incrementMetric(key, value);
}

function markLocalCacheHit() {
    incrementMetric('localHits');
}

function markLocalCacheMiss(reason = 'cold') {
    incrementMetric('localMisses');
    incrementMetric('cacheLookupMisses');
    markMissReason(reason);
}

function markNetworkMissBatch() {
    incrementMetric('networkMissBatches');
}

function markEdgeGetEligibleBatch() {
    incrementMetric('edgeGetEligibleBatches');
}

function markEdgeGetExecutedBatch() {
    incrementMetric('edgeGetExecutedBatches');
    incrementMetric('edgeGetRequests');
}

function markEdgeGetFailure() {
    incrementMetric('edgeGetFailures');
}

function markEdgeUrlTooLongSkip() {
    incrementMetric('edgeGetUrlTooLongSkips');
    markMissReason('url-too-long');
}

function maybeWarnEdgeUrlTooLong(urlLength, entriesLength) {
    if (!IS_DEV) return;
    const now = Date.now();
    const shouldLog = edgeUrlTooLongWarnCount < 3 || (now - edgeUrlTooLongWarnLastAt) > 15_000;
    if (!shouldLog) return;
    edgeUrlTooLongWarnLastAt = now;
    edgeUrlTooLongWarnCount += 1;
    console.warn(`[PriceService] Edge GET skipped: URL too long (${urlLength}) [entries=${entriesLength}]`);
    if (edgeUrlTooLongWarnCount === 3) {
        console.warn('[PriceService] URL-too-long warnings are now throttled (15s window).');
    }
}

function markPostFallback() {
    incrementMetric('postFallbacks');
    markMissReason('post-fallback');
}

function hashString(input) {
    const value = String(input ?? '');
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(36);
}

function rememberFingerprint(map, key, limit) {
    if (map.has(key)) map.delete(key);
    map.set(key, Date.now());
    if (map.size > limit) {
        const oldestKey = map.keys().next().value;
        map.delete(oldestKey);
    }
}

function buildEdgeEntryFingerprint(entry) {
    return `${entry?.[0] || 'rpc'}:${hashString(entry?.[1] || '')}`;
}

function buildEdgeRequestFingerprint(getUrl) {
    return `req:${hashString(getUrl)}`;
}

function classifyEdgeMiss(entries, getUrl) {
    const requestFingerprint = buildEdgeRequestFingerprint(getUrl);
    if (edgeRequestFingerprints.has(requestFingerprint)) {
        markMissReason('ttl-expired');
        return;
    }

    const hasKnownEntry = entries.some((entry) => edgeEntryFingerprints.has(buildEdgeEntryFingerprint(entry)));
    if (hasKnownEntry) {
        markMissReason('key-variant');
        return;
    }

    markMissReason('cold');
}

function rememberEdgeSuccess(entries, getUrl) {
    rememberFingerprint(edgeRequestFingerprints, buildEdgeRequestFingerprint(getUrl), EDGE_REQUEST_FINGERPRINT_LIMIT);
    entries.forEach((entry) => {
        rememberFingerprint(edgeEntryFingerprints, buildEdgeEntryFingerprint(entry), EDGE_ENTRY_FINGERPRINT_LIMIT);
    });
}

function getEdgeCacheState(headers) {
    const vercel = (headers.get('x-vercel-cache') || '').toUpperCase();
    if (vercel) return vercel;

    const cloudflare = (headers.get('cf-cache-status') || '').toUpperCase();
    if (!cloudflare) return '';

    // Normalize common Cloudflare states to existing metric buckets.
    if (cloudflare.includes('HIT')) return 'HIT';
    if (cloudflare.includes('MISS') || cloudflare.includes('EXPIRED')) return 'MISS';
    if (cloudflare.includes('STALE') || cloudflare.includes('REVALIDATED') || cloudflare.includes('UPDATING')) return 'STALE';
    return cloudflare; // BYPASS / DYNAMIC / NONE -> OTHER bucket
}

function recordEdgeResponse(headers, entries, getUrl) {
    incrementMetric('edgeGetSuccess');
    const edgeCache = getEdgeCacheState(headers);
    if (edgeCache.includes('HIT')) {
        incrementMetric('edgeServedHit');
    } else if (edgeCache.includes('MISS')) {
        incrementMetric('edgeServedMiss');
        classifyEdgeMiss(entries || [], getUrl || '');
    } else if (edgeCache.includes('STALE')) {
        incrementMetric('edgeServedStale');
    } else {
        incrementMetric('edgeServedOther');
    }
    rememberEdgeSuccess(entries || [], getUrl || '');

    const ageSec = Number.parseFloat(headers.get('age') || '0');
    if (Number.isFinite(ageSec) && ageSec >= 0) {
        incrementMetric('edgeAgeSamples');
        incrementMetric('edgeAgeMsTotal', ageSec * 1000);
    }
}

function logCacheMetricsSnapshot() {
    flushIntervalSourceLog(true);
    const edgeAgeAvgMs = cacheMetrics.edgeAgeSamples > 0
        ? Math.round(cacheMetrics.edgeAgeMsTotal / cacheMetrics.edgeAgeSamples)
        : 0;

    const counters = { ...cacheMetrics };
    const delta = {};
    Object.keys(counters).forEach((key) => {
        const prev = previousLoggedCounters?.[key] || 0;
        delta[key] = counters[key] - prev;
    });
    previousLoggedCounters = counters;

    const payload = {
        at: new Date().toISOString(),
        snapshot: {
            ...counters,
            edgeAgeAvgMs,
            intervalLocalIdbHitPct: (counters.intervalLocalHitsFromIdb + counters.intervalLocalHitsFromSession + counters.intervalLocalHitsFromMemory) > 0
                ? Math.round((counters.intervalLocalHitsFromIdb / (counters.intervalLocalHitsFromIdb + counters.intervalLocalHitsFromSession + counters.intervalLocalHitsFromMemory)) * 100)
                : null,
            edgeGetConversionPct: counters.edgeGetEligibleBatches > 0
                ? Math.round((counters.edgeGetExecutedBatches / counters.edgeGetEligibleBatches) * 100)
                : null
        },
        delta
    };

    console.info('[CacheMetrics][PriceService]', payload);
    persistCacheMetricsSnapshot(counters);
}

function loadPersistedCacheMetrics() {
    if (typeof sessionStorage === 'undefined') return null;
    try {
        const raw = sessionStorage.getItem(CACHE_METRICS_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || typeof parsed.snapshot !== 'object') return null;
        return parsed.snapshot;
    } catch {
        return null;
    }
}

function persistCacheMetricsSnapshot(snapshot) {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(CACHE_METRICS_STATE_KEY, JSON.stringify({
            at: Date.now(),
            snapshot
        }));
    } catch {
        // ignore storage failures
    }
}

function initProdCacheMetricsLogging() {
    if (!IS_PROD || cacheMetricsLoggerStarted) return;
    cacheMetricsLoggerStarted = true;

    const persisted = loadPersistedCacheMetrics();
    if (persisted) {
        Object.keys(cacheMetrics).forEach((key) => {
            const value = persisted[key];
            if (Number.isFinite(value)) {
                cacheMetrics[key] = value;
            }
        });
    }
    incrementMetric('appLoads');

    if (typeof globalThis === 'object') {
        globalThis.__TT_CACHE_METRICS__ = cacheMetrics;
    }

    logCacheMetricsSnapshot();
    setInterval(logCacheMetricsSnapshot, CACHE_METRICS_LOG_INTERVAL_MS);

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', logCacheMetricsSnapshot);
    }
}

initProdCacheMetricsLogging();

function estimateEdgeGetUrlLengthFromEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return 0;
    const rpcIds = [...new Set(entries.map(e => e[0]))];
    const fReq = JSON.stringify([entries]);
    const encoded = base64UrlEncode(fReq);
    const params = new URLSearchParams({
        rpcids: rpcIds.join(','),
        f_req: encoded,
        mk: getIstMarketCacheKey(),
    });
    return `${buildBatchUrl(rpcIds)}?${params.toString()}`.length;
}

function splitQueueItemsByUrlBudget(items, maxUrlLength = EDGE_CACHE_MAX_URL_LENGTH) {
    if (!Array.isArray(items) || items.length <= 1) return [items];

    const chunks = [];
    let current = [];

    for (const item of items) {
        if (current.length === 0) {
            current.push(item);
            continue;
        }

        const trial = [...current, item];
        const trialEntries = trial.map(itm => itm.q.entry);
        const trialLength = estimateEdgeGetUrlLengthFromEntries(trialEntries);

        if (trialLength <= maxUrlLength) {
            current.push(item);
        } else {
            chunks.push(current);
            current = [item];
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

function splitItemsByUrlBudget(items, toEntry, maxUrlLength = EDGE_CACHE_MAX_URL_LENGTH) {
    if (!Array.isArray(items) || items.length <= 1) return [items];

    const chunks = [];
    let current = [];

    for (const item of items) {
        if (current.length === 0) {
            current.push(item);
            continue;
        }

        const trial = [...current, item];
        const trialEntries = trial.map(toEntry);
        const trialLength = estimateEdgeGetUrlLengthFromEntries(trialEntries);

        if (trialLength <= maxUrlLength) {
            current.push(item);
        } else {
            chunks.push(current);
            current = [item];
        }
    }

    if (current.length > 0) chunks.push(current);
    return chunks;
}

async function runWithConcurrency(items, concurrency, worker) {
    if (!Array.isArray(items) || items.length === 0) return;
    const poolSize = Math.max(1, Math.min(concurrency, items.length));
    let cursor = 0;

    await Promise.all(Array.from({ length: poolSize }, async () => {
        while (cursor < items.length) {
            const index = cursor;
            cursor += 1;
            await worker(items[index], index);
        }
    }));
}

// ─── Helpers ───────────────────────────────────────────────────────

let cachedMarketKeyStamp = '';
let cachedMarketKeyValue = '';
let runtimePhaseCheckKey = '';

function getIstMarketPhaseState(now = new Date()) {
    const tokens = IST_MARKET_PARTS_FORMATTER.formatToParts(now);
    const parts = {};
    for (const token of tokens) {
        if (token.type !== 'literal') parts[token.type] = token.value;
    }

    const weekday = parts.weekday || 'Mon';
    const year = parts.year || '1970';
    const month = parts.month || '01';
    const day = parts.day || '01';
    const hour = Number.parseInt(parts.hour || '0', 10) % 24;
    const minute = Number.parseInt(parts.minute || '0', 10);
    const dayIndex = Object.prototype.hasOwnProperty.call(IST_WEEKDAY_TO_INDEX, weekday)
        ? IST_WEEKDAY_TO_INDEX[weekday]
        : 1;
    const totalMinutes = (hour * 60) + minute;

    let phaseType = 'live';
    let phaseKey = `live-${year}${month}${day}`;
    if (dayIndex === 0) {
        phaseType = 'sunday';
        phaseKey = `sun-${year}${month}${day}-slot${Math.floor(hour / 6)}`;
    } else if (dayIndex === 1 && totalMinutes < MONDAY_OPEN_TOTAL_MINUTES) {
        phaseType = 'preopen';
        phaseKey = `mon-preopen-${year}${month}${day}`;
    }

    return {
        phaseKey,
        phaseType,
        dayIndex,
        totalMinutes,
    };
}

function getIstMarketCacheKey(now = new Date()) {
    const state = getIstMarketPhaseState(now);
    const stamp = state.phaseKey;
    if (cachedMarketKeyStamp === stamp && cachedMarketKeyValue) return cachedMarketKeyValue;
    cachedMarketKeyStamp = stamp;
    cachedMarketKeyValue = state.phaseKey;
    return state.phaseKey;
}

function readStoredMarketPhaseState() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(MARKET_PHASE_STATE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.phaseKey !== 'string' || typeof parsed.phaseType !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}

function writeStoredMarketPhaseState(state) {
    if (typeof localStorage === 'undefined' || !state) return;
    try {
        localStorage.setItem(MARKET_PHASE_STATE_KEY, JSON.stringify({
            phaseKey: state.phaseKey,
            phaseType: state.phaseType,
            updatedAt: Date.now(),
        }));
    } catch {
        // ignore
    }
}

function shouldPurgeAtMarketBoundary(previousState, currentState) {
    if (!currentState || currentState.phaseType !== 'live') return false;

    if (!previousState) {
        // Safety for first load after deploy/version upgrade: if it's Monday live, hard-reset once.
        return currentState.dayIndex === 1 && currentState.totalMinutes >= MONDAY_OPEN_TOTAL_MINUTES;
    }

    if (previousState.phaseKey === currentState.phaseKey) return false;
    if (previousState.phaseType === 'preopen' || previousState.phaseType === 'sunday') return true;
    return false;
}

function ensureMarketBoundaryPurge() {
    if (typeof window === 'undefined') return;

    const currentState = getIstMarketPhaseState();
    if (runtimePhaseCheckKey === currentState.phaseKey) return;

    const previousState = readStoredMarketPhaseState();
    if (shouldPurgeAtMarketBoundary(previousState, currentState)) {
        clearPriceCache();
        incrementMetric('marketBoundaryPurges');
        console.info('[PriceService][MarketBoundaryPurge]', {
            from: previousState?.phaseKey || 'none',
            to: currentState.phaseKey,
            at: new Date().toISOString(),
        });
    }

    writeStoredMarketPhaseState(currentState);
    runtimePhaseCheckKey = currentState.phaseKey;
}

function getExchange(symbol) {
    return /^\d+$/.test(symbol) ? 'BOM' : 'NSE';
}

export const cleanSymbol = sharedCleanSymbol;

function buildBatchUrl(rpcIds) {
    // Bypassing /v1/ rewrites to ensure Vercel doesn't choke on long GET query params
    return '/api/fuckyouuuu';
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

            // Sort the group deterministically by RPC ID and arguments (stringified)
            // This ensures that regardless of component mount order, same-content batches
            // produce the same GET URL, maximizing Edge/CDN cache hits.
            const sortedGroup = [...group].sort((a, b) => {
                const keyA = `${a.q.entry[0]}:${a.q.entry[1]}`;
                const keyB = `${b.q.entry[0]}:${b.q.entry[1]}`;
                return keyA.localeCompare(keyB);
            });

            const isRealtimeGroup = sortedGroup[0].q.entry[0] === GOOGLE_RPC_PRICE;
            const transportGroups = [];
            // Use fixed group sizes to ensure stable, repeatable cache keys.
            // If we used sortedGroup.length, the cache key would change depending on 
            // how many items were in the queue at that exact frame.
            const transportChunkSize = isRealtimeGroup ? EDGE_REALTIME_GROUP_SIZE : EDGE_CACHEABLE_GROUP_SIZE;

            for (let i = 0; i < sortedGroup.length; i += transportChunkSize) {
                const seededGroup = sortedGroup.slice(i, i + transportChunkSize);
                splitQueueItemsByUrlBudget(seededGroup).forEach((budgetGroup) => {
                    transportGroups.push(budgetGroup);
                });
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
async function executeBatch(entries, timeoutMs = EDGE_BATCH_TIMEOUT_MS) {
    if (entries.length === 0) return { text: '', responseTtlMs: null };
    markNetworkMissBatch();

    const rpcIds = [...new Set(entries.map(e => e[0]))];
    const url = buildBatchUrl(rpcIds);
    const fReq = JSON.stringify([entries]);

    // Prefer CDN-cacheable GET transport for all batch types; fallback to POST.
    const encoded = base64UrlEncode(fReq);
    const params = new URLSearchParams({
        rpcids: rpcIds.join(','),
        f_req: encoded,
        mk: getIstMarketCacheKey(),
    });
    const getUrl = `${url}?${params.toString()}`;

    const canUseEdgeGet = getUrl.length <= EDGE_CACHE_MAX_URL_LENGTH;
    if (canUseEdgeGet) {
        markEdgeGetEligibleBatch();
        markEdgeGetExecutedBatch();
    } else {
        markEdgeUrlTooLongSkip();
        maybeWarnEdgeUrlTooLong(getUrl.length, entries.length);
    }

    let lastError = null;
    for (let attempt = 0; attempt <= EDGE_BATCH_RETRIES; attempt++) {
        const attemptTimeout = timeoutMs + (attempt * 4000);
        try {
            if (canUseEdgeGet) {
                const getResponse = await fetch(getUrl, {
                    method: 'GET',
                    signal: AbortSignal.timeout?.(attemptTimeout),
                });
                if (getResponse.ok) {
                    const text = await getResponse.text();
                    if (isLikelyValidBatchResponse(text, rpcIds)) {
                        recordEdgeResponse(getResponse.headers, entries, getUrl);
                        return {
                            text,
                            responseTtlMs: getRemainingEdgeTtlMs(getResponse.headers)
                        };
                    }
                    markEdgeGetFailure();
                    if (IS_DEV) {
                        console.warn('[PriceService] Edge GET payload invalid, falling back to POST');
                    }
                } else {
                    markEdgeGetFailure();
                    if (IS_DEV) {
                        console.warn(`[PriceService] Edge GET batch failed (${getResponse.status}), falling back to POST`);
                    }
                }
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
                signal: AbortSignal.timeout?.(attemptTimeout),
            });

            if (!response.ok) throw new Error(`Batch failed: ${response.status}`);
            const text = await response.text();
            if (!isLikelyValidBatchResponse(text, rpcIds)) {
                throw new Error('Batch payload malformed');
            }
            return { text, responseTtlMs: null };
        } catch (error) {
            lastError = error;
            if (attempt < EDGE_BATCH_RETRIES) {
                if (IS_DEV) {
                    console.warn(`[PriceService] Batch retry ${attempt + 1}/${EDGE_BATCH_RETRIES} after error: ${error?.message || error}`);
                }
                await new Promise((resolve) => setTimeout(resolve, EDGE_BATCH_RETRY_BACKOFF_MS * (attempt + 1)));
            }
        }
    }

    throw lastError || new Error('Batch failed: unknown error');
}

function isLikelyValidBatchResponse(text, rpcIds) {
    if (typeof text !== 'string' || text.length < 24) return false;
    if (!text.includes('"wrb.fr"')) return false;
    if (!Array.isArray(rpcIds) || rpcIds.length === 0) return true;
    return rpcIds.some((rpcId) => text.includes(`"${rpcId}"`));
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
    const symbol = cleanSymbol(symbolInfo[0]);
    if (!symbol) return null;

    return {
        symbol,
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
    const symbol = cleanSymbol(symbolInfo[0]);
    if (!symbol) return null;

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
        symbol,
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
    const symbol = cleanSymbol(symbolInfo?.[0]);
    if (!symbol) return null;

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
        symbol,
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

    const rawBody = JSON.stringify({
        fromStr, toStr, encoded,
        path: '/v2/api/equity/priceticks'
    });

    const getParams = new URLSearchParams({
        f_req: base64UrlEncode(rawBody),
        mk: getIstMarketCacheKey(),
    });
    const getUrl = `/api/fckyouuu1?${getParams.toString()}`;

    try {
        let response;
        if (getUrl.length <= EDGE_CACHE_MAX_URL_LENGTH) {
            response = await fetch(getUrl, {
                method: 'GET',
                signal: AbortSignal.timeout?.(15000),
            });
        }

        if (!response || !response.ok) {
            const payload = await seal(rawBody);
            response = await fetch('/api/fckyouuu1', {
                method: 'POST',
                headers: { 'Content-Type': CT_PLAIN },
                body: payload,
                signal: AbortSignal.timeout?.(15000),
            });
        }

        if (!response.ok) return null;

        const data = await response.json();
        const ticks = data?.data?.ticks?.[clean] || data?.data?.ticks?.[symbol.toUpperCase()];
        if (!ticks?.length) return null;

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
    } catch (err) {
        console.warn(`[PriceService] Strike fetch failed: ${err.message}`);
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
    ensureMarketBoundaryPurge();
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
            markLocalCacheMiss(cacheLookupMissReason(cached));
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

const pendingIntervalReqs = new Map(); // timeframe:window -> Map<symbol, true>
const intervalWaitTimers = new Map(); // timeframe:window -> timer
const intervalWaiters = new Map(); // timeframe:window -> Set<() => void>

function getOrCreateIntervalWaiters(cacheKeyBase) {
    if (!intervalWaiters.has(cacheKeyBase)) {
        intervalWaiters.set(cacheKeyBase, new Set());
    }
    return intervalWaiters.get(cacheKeyBase);
}

/**
 * Fetch interval change % for MANY symbols.
 * Consolidation: Merges multiple calls in the same tick into a single set of parallel batches.
 */
export async function fetchBatchIntervalPerformance(symbols, interval = '1M') {
    ensureMarketBoundaryPurge();
    await ensureIntervalCacheHydrated();
    const window = INTERVAL_WINDOWS[interval] || 3;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const cacheKeyBase = `${interval}:${window}`;
    let callIdbHits = 0;
    let callSessionHits = 0;
    let callMemoryHits = 0;
    let callMisses = 0;

    if (!pendingIntervalReqs.has(cacheKeyBase)) {
        pendingIntervalReqs.set(cacheKeyBase, new Map());
    }
    const currentPending = pendingIntervalReqs.get(cacheKeyBase);
    const currentWaiters = getOrCreateIntervalWaiters(cacheKeyBase);

    // 1. Filter out already cached symbols
    const uncached = [];
    const results = new Map();

    for (const raw of symbols) {
        const sym = cleanSymbol(raw);
        const { cacheKey, cached } = resolveIntervalCacheRecord(sym, interval, window);

        if (isIntervalRowFresh(cached, ttl)) {
            markLocalCacheHit();
            if (idbHydratedIntervalKeys.has(cacheKey)) {
                incrementMetric('intervalLocalHitsFromIdb');
                callIdbHits += 1;
            } else if (sessionHydratedIntervalKeys.has(cacheKey)) {
                incrementMetric('intervalLocalHitsFromSession');
                incrementMetric('intervalLocalHitsFromMemorySession');
                callSessionHits += 1;
            } else {
                incrementMetric('intervalLocalHitsFromMemory');
                incrementMetric('intervalLocalHitsFromMemorySession');
                callMemoryHits += 1;
            }
            if (cached.data !== null) results.set(sym, cached.data);
        } else if (!currentPending.has(sym)) {
            markLocalCacheMiss(cacheLookupMissReason(cached));
            callMisses += 1;
            uncached.push(sym);
        }
    }

    recordIntervalSourceSample({
        symbols: symbols.length,
        idbHits: callIdbHits,
        sessionHits: callSessionHits,
        memoryHits: callMemoryHits,
        misses: callMisses
    });

    if (uncached.length === 0) {
        // All either cached or already pending.
        const requestedPending = symbols.map(s => cleanSymbol(s)).filter(s => currentPending.has(s));
        if (requestedPending.length === 0) return results;

        return new Promise((resolve) => {
            currentWaiters.add(resolve);
        }).then(() => {
            symbols.forEach(s => {
                const sym = cleanSymbol(s);
                const { cached: c } = resolveIntervalCacheRecord(sym, interval, window);
                if (c?.data) results.set(sym, c.data);
            });
            return results;
        });
    }

    // 2. Mark newly pending symbols and register this caller as waiter
    uncached.forEach(sym => currentPending.set(sym, true));
    const waitForFlush = new Promise((resolve) => {
        currentWaiters.add(resolve);
    });

    // 3. Schedule the execution
    if (intervalWaitTimers.has(cacheKeyBase)) clearTimeout(intervalWaitTimers.get(cacheKeyBase));

    intervalWaitTimers.set(cacheKeyBase, setTimeout(async () => {
        intervalWaitTimers.delete(cacheKeyBase);
        const waiters = getOrCreateIntervalWaiters(cacheKeyBase);
        let waitersResolved = false;
        const resolveAllWaiters = () => {
            if (waitersResolved) return;
            waitersResolved = true;
            const callbacks = Array.from(waiters);
            waiters.clear();
            callbacks.forEach((resolve) => {
                try {
                    resolve();
                } catch {
                    // ignore waiter resolution errors
                }
            });
        };
        try {
            // Final list of ALL symbols waiting for this specific timeframe
            const allUncached = Array.from(currentPending.keys()).filter(s => {
                const { cached: c } = resolveIntervalCacheRecord(s, interval, window);
                return !isIntervalRowFresh(c, ttl);
            });

            if (allUncached.length === 0) return;

            if (IS_DEV) {
                console.debug(`[PriceService] Consolidating Interval ${interval} — Batching ${allUncached.length} symbols`);
            }

            // Seed chunking keeps fanout bounded before URL-budget splitting.
            const CHUNK_SIZE = 550;
            const seededChunks = [];
            for (let i = 0; i < allUncached.length; i += CHUNK_SIZE) {
                seededChunks.push(allUncached.slice(i, i + CHUNK_SIZE));
            }

            const transportGroups = [];
            seededChunks.forEach((seededChunk) => {
                const seededItems = seededChunk.map((sym) => {
                    const ex = getExchange(sym);
                    const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
                    return {
                        symbol: sym,
                        entry: [GOOGLE_RPC_CHART, rpcArgs, null, 'generic']
                    };
                });
                splitItemsByUrlBudget(seededItems, (item) => item.entry).forEach((group) => {
                    transportGroups.push(group);
                });
            });

            if (IS_DEV) {
                console.debug(`[PriceService] Interval ${interval} transport groups: ${transportGroups.length}`);
            }

            const unresolvedSymbols = new Set();

            const processTransportGroup = async (group, { applyNegativeCache = false } = {}) => {
                const entries = group.map((item) => item.entry);
                const groupSymbols = group.map((item) => item.symbol);
                try {
                    const batchResult = await executeBatch(entries);
                    const frames = parseAllFrames(batchResult.text).filter(f => f.rpcId === GOOGLE_RPC_CHART);
                    const returned = new Set();

                    frames.forEach(frame => {
                        const extracted = extractChartFromFrame(frame.payload, interval);
                        if (extracted) {
                            const cacheKey = getIntervalCacheKey(extracted.symbol, interval, window);
                            const row = buildCacheRow(extracted.data, batchResult.responseTtlMs, ttl);
                            if (row) {
                                intervalCache.set(cacheKey, row);
                                idbHydratedIntervalKeys.delete(cacheKey);
                                sessionHydratedIntervalKeys.delete(cacheKey);
                            }
                            returned.add(extracted.symbol);
                        }
                    });

                    const hasAnyExtractedRow = returned.size > 0;
                    groupSymbols.forEach((sym) => {
                        if (returned.has(sym)) return;
                        unresolvedSymbols.add(sym);
                        if (!applyNegativeCache || !hasAnyExtractedRow) return;

                        const cacheKey = getIntervalCacheKey(sym, interval, window);
                        const row = buildCacheRow(null, batchResult.responseTtlMs, Math.min(ttl, INTERVAL_NEGATIVE_CACHE_TTL_MS));
                        if (!row) return;
                        intervalCache.set(cacheKey, row);
                        idbHydratedIntervalKeys.delete(cacheKey);
                        sessionHydratedIntervalKeys.delete(cacheKey);
                    });
                } catch (err) {
                    groupSymbols.forEach((sym) => unresolvedSymbols.add(sym));
                    console.warn(`[PriceService] Parallel chunk failed:`, err.message);
                }
            };

            await runWithConcurrency(transportGroups, INTERVAL_CHUNK_CONCURRENCY, (group) => processTransportGroup(group));

            if (unresolvedSymbols.size > 0) {
                const retrySymbols = Array.from(unresolvedSymbols).filter((sym) => {
                    const { cached } = resolveIntervalCacheRecord(sym, interval, window);
                    return !isIntervalRowFresh(cached, ttl);
                });
                unresolvedSymbols.clear();

                if (retrySymbols.length > 0) {
                    if (IS_DEV) {
                        console.warn(`[PriceService] Interval ${interval} retrying unresolved symbols: ${retrySymbols.length}`);
                    }

                    const retrySeededChunks = [];
                    for (let i = 0; i < retrySymbols.length; i += INTERVAL_RETRY_CHUNK_SIZE) {
                        retrySeededChunks.push(retrySymbols.slice(i, i + INTERVAL_RETRY_CHUNK_SIZE));
                    }

                    const retryGroups = [];
                    retrySeededChunks.forEach((seededChunk) => {
                        const seededItems = seededChunk.map((sym) => {
                            const ex = getExchange(sym);
                            const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
                            return {
                                symbol: sym,
                                entry: [GOOGLE_RPC_CHART, rpcArgs, null, 'generic']
                            };
                        });
                        splitItemsByUrlBudget(seededItems, (item) => item.entry).forEach((group) => {
                            retryGroups.push(group);
                        });
                    });

                    await runWithConcurrency(retryGroups, INTERVAL_RETRY_CHUNK_CONCURRENCY, (group) =>
                        processTransportGroup(group, { applyNegativeCache: true })
                    );
                }
            }

            scheduleIntervalSave();
        } catch (err) {
            console.warn(`[PriceService] Interval ${interval} consolidation failed:`, err?.message || err);
        } finally {
            currentPending.clear(); // Clear pending map for this timeframe
            resolveAllWaiters();
        }
    }, 50)); // 50ms window to aggregate hook calls

    // Return results merged with any pending data
    return waitForFlush.then(() => {
        symbols.forEach(s => {
            const sym = cleanSymbol(s);
            const { cached: c } = resolveIntervalCacheRecord(sym, interval, window);
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
export async function fetchUnifiedTrackerData(symbols, interval = '1M', options = {}) {
    ensureMarketBoundaryPurge();
    const includeBreadth = options?.includeBreadth !== false;
    const keys = [...new Set(symbols.map(s => cleanSymbol(s)))];
    const modeKey = includeBreadth ? 'withBreadth' : 'perfOnly';
    const requestKey = `${modeKey}:${interval}:${[...keys].sort().join(',')}`;
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
            if (isCacheRowFresh(cached, 300_000) && (!includeBreadth || cached?.data?.hasBreadth === true)) {
                markLocalCacheHit();
                results.set(sym, cached.data);
            } else {
                markLocalCacheMiss(cacheLookupMissReason(cached));
                uncachedKeys.push(sym);
            }
        });

        if (uncachedKeys.length === 0) return results;

        if (!includeBreadth) {
            const perfMap = await fetchBatchIntervalPerformance(uncachedKeys, interval);
            uncachedKeys.forEach(sym => {
                const perf = perfMap.get(sym);
                if (!perf || typeof perf.changePct !== 'number') return;

                const data = {
                    perf: { changePct: perf.changePct, close: perf.close },
                    breadth: {},
                    hasBreadth: false,
                };

                const row = buildCacheRow(data, null, 300_000);
                if (row) unifiedResultCache.set(`${interval}:${sym}`, row);
                results.set(sym, data);
            });
            return results;
        }

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
                },
                hasBreadth: true,
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
    ensureMarketBoundaryPurge();
    const keys = symbols.map(s => cleanSymbol(s));
    const results = new Map();
    const uncached = [];

    for (const key of keys) {
        const cached = fundaCache.get(key);
        if (isCacheRowFresh(cached, FUNDA_CACHE_TTL)) {
            markLocalCacheHit();
            results.set(key, cached.data);
        } else {
            markLocalCacheMiss(cacheLookupMissReason(cached));
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
    ensureMarketBoundaryPurge();
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
            markLocalCacheMiss(cacheLookupMissReason(cached));
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
    comparisonCacheMap.clear();
    unifiedResultCache.clear();
    pendingUnifiedRequests.clear();
    pendingRpcRequests.clear();
    idbHydratedIntervalKeys.clear();
    sessionHydratedIntervalKeys.clear();
    flushIntervalSourceLog(true);
    sessionStorage.removeItem(PRICE_CACHE_KEY);
    sessionStorage.removeItem(INTERVAL_CACHE_KEY);
    sessionStorage.removeItem(FUNDA_CACHE_KEY);
    void clearIntervalCacheFromIndexedDb();
}

/**
 * Read cached interval data synchronously (no fetch).
 * Returns { changePct, close } or null if not cached/expired.
 */
export function getCachedInterval(symbol, interval) {
    ensureMarketBoundaryPurge();
    const key = cleanSymbol(symbol);
    const window = INTERVAL_WINDOWS[interval] || 3;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const { cacheKey, cached } = resolveIntervalCacheRecord(key, interval, window);
    if (isIntervalRowFresh(cached, ttl)) {
        markLocalCacheHit();
        if (idbHydratedIntervalKeys.has(cacheKey)) {
            incrementMetric('intervalLocalHitsFromIdb');
        } else if (sessionHydratedIntervalKeys.has(cacheKey)) {
            incrementMetric('intervalLocalHitsFromSession');
            incrementMetric('intervalLocalHitsFromMemorySession');
        } else {
            incrementMetric('intervalLocalHitsFromMemory');
            incrementMetric('intervalLocalHitsFromMemorySession');
        }
        return cached.data;
    }
    markLocalCacheMiss(cacheLookupMissReason(cached));
    return null;
}

/**
 * Read cached price data synchronously (no fetch).
 */
export function getCachedPrice(symbol) {
    ensureMarketBoundaryPurge();
    const key = cleanSymbol(symbol);
    const cached = priceCache.get(key);
    if (isCacheRowFresh(cached, PRICE_CACHE_TTL)) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss(cacheLookupMissReason(cached));
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
