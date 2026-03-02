import AsyncStorage from '@react-native-async-storage/async-storage';
import { cleanSymbol } from '@core/symbol/cleanSymbol';
import { calculateEMA as sharedCalculateEMA, calculateSMA as sharedCalculateSMA } from '@core/math/indicators';
import { getMobileProxyUrl } from './networkConfig';

export { cleanSymbol };
export const calculateEMA = sharedCalculateEMA;
export const calculateSMA = sharedCalculateSMA;

const GOOGLE_RPC_PRICE = 'xh8wxf';
const GOOGLE_RPC_CHART = 'AiCwsd';
const GOOGLE_RPC_FUNDAMENTALS = 'HqGpWd';
const GOOGLE_BATCH_ENDPOINT = 'https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute';
const BATCH_PROXY_URL = getMobileProxyUrl('/api/mobile-batch');
const STRIKE_PROXY_URL = getMobileProxyUrl('/api/mobile-strike');

const MAX_BATCH_SIZE = 550;
const BATCH_AGGREGATION_WINDOW = 16; // 16ms (frame-sync) for instant feel
const EDGE_CACHE_MAX_URL_LENGTH = 7000;
const EDGE_REALTIME_GROUP_SIZE = 550;
const EDGE_BATCH_TTL_MS = 300_000;
const IS_PROD = typeof __DEV__ !== 'undefined' ? !__DEV__ : true;
const CACHE_METRICS_LOG_INTERVAL_MS = 60_000;

const PRICE_CACHE_KEY = 'tt_price_cache:v1';
const INTERVAL_CACHE_KEY = 'tt_interval_cache:v1';
const FUNDA_CACHE_KEY = 'tt_funda_cache:v1';

const PRICE_CACHE_TTL = 300_000;
const COMPARISON_CACHE_TTL = 300_000;
const FUNDA_CACHE_TTL = 3_600_000;

const MAX_PERSISTED_PRICE_ENTRIES = 1200;
const MAX_PERSISTED_INTERVAL_ENTRIES = 6000;
const MAX_PERSISTED_FUNDA_ENTRIES = 1500;

type PriceData = {
    price: number;
    change: number;
    changePct: number;
    prevClose: number;
    source?: string;
};

type IntervalData = {
    changePct: number;
    close?: number;
};

type CacheRow<T> = {
    data: T;
    timestamp: number;
    ttlMs?: number;
};

type UnifiedData = {
    perf: { changePct: number; close: number };
    breadth: {
        above10EMA: boolean;
        above21EMA: boolean;
        above50EMA: boolean;
        above150EMA: boolean;
        above200EMA: boolean;
        ema10: number | null;
        ema21: number | null;
        ema50: number | null;
        ema150: number | null;
        ema200: number | null;
    };
};

const comparisonCacheMap = new Map<string, { series: any[]; timestamp: number; ttlMs?: number }>();
const unifiedResultCache = new Map<string, { data: UnifiedData; timestamp: number; ttlMs?: number }>();
const priceCache = new Map<string, CacheRow<PriceData>>();
const intervalCache = new Map<string, CacheRow<IntervalData | null>>();
const fundaCache = new Map<string, CacheRow<any>>();

function getExchange(symbol: string) {
    return /^\d+$/.test(symbol) ? 'BOM' : 'NSE';
}

function pruneCacheEntries<T>(cache: Map<string, T>, maxEntries: number) {
    if (cache.size <= maxEntries) return cache;

    const sortedEntries = [...cache.entries()]
        .sort((a, b) => {
            const aTs = (a?.[1] as any)?.timestamp || 0;
            const bTs = (b?.[1] as any)?.timestamp || 0;
            return bTs - aTs;
        })
        .slice(0, maxEntries);

    cache.clear();
    sortedEntries.forEach(([key, value]) => cache.set(key, value));
    return cache;
}

function serializeMap(map: Map<string, any>) {
    return JSON.stringify([...map]);
}

function deserializeMap<T>(raw: string | null): Map<string, T> {
    try {
        if (!raw) return new Map();
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Map();
        return new Map(parsed);
    } catch {
        return new Map();
    }
}

async function hydrateCaches() {
    try {
        const [rawPrice, rawInterval, rawFunda] = await Promise.all([
            AsyncStorage.getItem(PRICE_CACHE_KEY),
            AsyncStorage.getItem(INTERVAL_CACHE_KEY),
            AsyncStorage.getItem(FUNDA_CACHE_KEY),
        ]);

        const loadedPrice = pruneCacheEntries(deserializeMap<CacheRow<PriceData>>(rawPrice), MAX_PERSISTED_PRICE_ENTRIES);
        const loadedInterval = pruneCacheEntries(
            deserializeMap<CacheRow<IntervalData | null>>(rawInterval),
            MAX_PERSISTED_INTERVAL_ENTRIES,
        );
        const loadedFunda = pruneCacheEntries(deserializeMap<CacheRow<any>>(rawFunda), MAX_PERSISTED_FUNDA_ENTRIES);

        loadedPrice.forEach((value, key) => priceCache.set(key, value));
        loadedInterval.forEach((value, key) => intervalCache.set(key, value));
        loadedFunda.forEach((value, key) => fundaCache.set(key, value));
    } catch {
        // ignore hydration failures
    }
}

const cacheHydrationPromise = hydrateCaches();

let priceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let intervalSaveTimer: ReturnType<typeof setTimeout> | null = null;
let fundaSaveTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePriceSave() {
    if (priceSaveTimer) clearTimeout(priceSaveTimer);
    priceSaveTimer = setTimeout(async () => {
        try {
            pruneCacheEntries(priceCache, MAX_PERSISTED_PRICE_ENTRIES);
            await AsyncStorage.setItem(PRICE_CACHE_KEY, serializeMap(priceCache));
        } catch {
            // ignore storage errors
        }
    }, 500);
}

function scheduleIntervalSave() {
    if (intervalSaveTimer) clearTimeout(intervalSaveTimer);
    intervalSaveTimer = setTimeout(async () => {
        try {
            pruneCacheEntries(intervalCache, MAX_PERSISTED_INTERVAL_ENTRIES);
            await AsyncStorage.setItem(INTERVAL_CACHE_KEY, serializeMap(intervalCache));
        } catch {
            // ignore storage errors
        }
    }, 500);
}

function scheduleFundaSave() {
    if (fundaSaveTimer) clearTimeout(fundaSaveTimer);
    fundaSaveTimer = setTimeout(async () => {
        try {
            pruneCacheEntries(fundaCache, MAX_PERSISTED_FUNDA_ENTRIES);
            await AsyncStorage.setItem(FUNDA_CACHE_KEY, serializeMap(fundaCache));
        } catch {
            // ignore storage errors
        }
    }, 500);
}

export const INTERVAL_WINDOWS: Record<string, number> = {
    '1D': 1,
    '5D': 2,
    '1M': 3,
    '6M': 4,
    YTD: 5,
    '1Y': 6,
    '5Y': 7,
    MAX: 8,
};

const INTERVAL_CACHE_TTL: Record<string, number> = {
    '1D': 300_000,
    '5D': 300_000,
    '1M': 600_000,
    '6M': 600_000,
    YTD: 600_000,
    '1Y': 600_000,
    '5Y': 600_000,
    MAX: 600_000,
};

function resolveEffectiveTtl(row: { ttlMs?: number } | undefined, fallbackTtl: number) {
    if (row && Number.isFinite(row.ttlMs)) {
        return Math.max(0, Math.min(fallbackTtl, row.ttlMs as number));
    }
    return fallbackTtl;
}

function isCacheRowFresh(row: { timestamp: number; ttlMs?: number } | undefined, fallbackTtl: number) {
    if (!row) return false;
    const ttl = resolveEffectiveTtl(row, fallbackTtl);
    return Date.now() - row.timestamp < ttl;
}

function buildCacheRow<T>(data: T, responseTtlMs: number | null, fallbackTtl: number): CacheRow<T> | null {
    const ttlMs = Number.isFinite(responseTtlMs)
        ? Math.max(0, Math.min(fallbackTtl, responseTtlMs as number))
        : fallbackTtl;
    if (ttlMs <= 0) return null;
    return { data, timestamp: Date.now(), ttlMs };
}

function getRemainingEdgeTtlMs(headers: Headers) {
    const ageHeader = headers.get('age');
    const ageSec = Number.parseFloat(ageHeader || '0');
    const safeAgeSec = Number.isFinite(ageSec) && ageSec > 0 ? ageSec : 0;
    return Math.max(0, EDGE_BATCH_TTL_MS - safeAgeSec * 1000);
}

function base64UrlEncode(value: string) {
    const bytes = new TextEncoder().encode(value);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let out = '';
    let i = 0;

    for (; i + 2 < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += chars[(n >> 18) & 63];
        out += chars[(n >> 12) & 63];
        out += chars[(n >> 6) & 63];
        out += chars[n & 63];
    }

    if (i < bytes.length) {
        let n = bytes[i] << 16;
        out += chars[(n >> 18) & 63];
        if (i + 1 < bytes.length) {
            n |= bytes[i + 1] << 8;
            out += chars[(n >> 12) & 63];
            out += chars[(n >> 6) & 63];
        } else {
            out += chars[(n >> 12) & 63];
        }
    }

    return out;
}

const cacheMetrics: Record<string, number> = {
    localHits: 0,
    localMisses: 0,
    cacheLookupMisses: 0,
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
};

let cacheMetricsLoggerStarted = false;
let previousLoggedCounters: Record<string, number> | null = null;

function incrementMetric(key: string, value = 1) {
    cacheMetrics[key] = (cacheMetrics[key] || 0) + value;
}

function markLocalCacheHit() {
    incrementMetric('localHits');
}

function markLocalCacheMiss() {
    incrementMetric('localMisses');
    incrementMetric('cacheLookupMisses');
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
}

function markPostFallback() {
    incrementMetric('postFallbacks');
}

function recordEdgeResponse(headers: Headers) {
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

    const counters = { ...cacheMetrics };
    const delta: Record<string, number> = {};
    Object.keys(counters).forEach((key) => {
        const prev = previousLoggedCounters?.[key] || 0;
        delta[key] = counters[key] - prev;
    });
    previousLoggedCounters = counters;

    const payload = {
        at: new Date().toISOString(),
        snapshot: { ...counters, edgeAgeAvgMs },
        delta,
    };

    console.info('[CacheMetrics][MobilePriceService]', payload);
}

function initProdCacheMetricsLogging() {
    if (!IS_PROD || cacheMetricsLoggerStarted) return;
    cacheMetricsLoggerStarted = true;

    (globalThis as any).__TT_MOBILE_CACHE_METRICS__ = cacheMetrics;
    logCacheMetricsSnapshot();
    setInterval(logCacheMetricsSnapshot, CACHE_METRICS_LOG_INTERVAL_MS);
}

initProdCacheMetricsLogging();

function estimateEdgeGetUrlLengthFromEntries(entries: any[]) {
    if (!BATCH_PROXY_URL) return 0;
    if (!Array.isArray(entries) || entries.length === 0) return 0;

    const rpcIds = [...new Set(entries.map((entry) => entry[0]))] as string[];
    const fReq = JSON.stringify([entries]);
    const encodedReq = base64UrlEncode(fReq);
    const getQuery = new URLSearchParams({
        rpcids: rpcIds.join(','),
        f_req: encodedReq,
    });
    return `${BATCH_PROXY_URL}?${getQuery.toString()}`.length;
}

// ─── Transport: All requests go through proxy ─────────────────────

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Execute a batch via the proxy server.
 * The proxy forwards to Google Finance with proper Origin/Referer headers.
 */
async function executeBatch(entries: any[], timeoutMs = 12_000) {
    if (!entries.length) return { text: '', responseTtlMs: null as number | null };
    markNetworkMissBatch();

    const rpcIds = [...new Set(entries.map((entry) => entry[0]))] as string[];
    const fReq = JSON.stringify([entries]);
    const body = new URLSearchParams({ 'f.req': fReq }).toString();

    if (BATCH_PROXY_URL) {
        const encodedReq = base64UrlEncode(fReq);
        const getQuery = new URLSearchParams({
            rpcids: rpcIds.join(','),
            f_req: encodedReq,
        });
        const getUrl = `${BATCH_PROXY_URL}?${getQuery.toString()}`;

        if (getUrl.length <= EDGE_CACHE_MAX_URL_LENGTH) {
            markEdgeGetEligibleBatch();
            markEdgeGetExecutedBatch();
            try {
                const getResponse = await fetchWithTimeout(
                    getUrl,
                    {
                        method: 'GET',
                    },
                    timeoutMs,
                );

                if (getResponse.ok) {
                    recordEdgeResponse(getResponse.headers);
                    return {
                        text: await getResponse.text(),
                        responseTtlMs: getRemainingEdgeTtlMs(getResponse.headers),
                    };
                }
                markEdgeGetFailure();
            } catch {
                markEdgeGetFailure();
                // fall back to POST proxy path below
            }
        } else {
            markEdgeUrlTooLongSkip();
        }

        try {
            const response = await fetchWithTimeout(
                BATCH_PROXY_URL,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                        'x-rpc-ids': rpcIds.join(','),
                    },
                    body,
                },
                timeoutMs,
            );

            if (!response.ok) {
                throw new Error(`Proxy batch failed: ${response.status}`);
            }

            markPostFallback();
            return { text: await response.text(), responseTtlMs: null as number | null };
        } catch {
            if (!warnedBatchFallback) {
                console.warn('[PriceService] mobile-batch proxy unavailable, using direct Google endpoint.');
                warnedBatchFallback = true;
            }
        }
    }

    const directUrl =
        `${GOOGLE_BATCH_ENDPOINT}?rpcids=${encodeURIComponent(rpcIds.join(','))}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
    const directResponse = await fetchWithTimeout(
        directUrl,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                Origin: 'https://www.google.com',
                Referer: 'https://www.google.com/finance/',
                'User-Agent': 'Mozilla/5.0',
            },
            body,
        },
        timeoutMs,
    );

    if (!directResponse.ok) {
        throw new Error(`Direct batch failed: ${directResponse.status}`);
    }

    markPostFallback();
    return { text: await directResponse.text(), responseTtlMs: null as number | null };
}




function parseAllFrames(text: string) {
    const frames: { rpcId: string; payload: any }[] = [];
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
                } catch {
                    // skip malformed frame payload
                }
            }
        } catch {
            // skip malformed json line
        }
    }

    return frames;
}

function extractPriceFromFrame(payload: any) {
    const quote = payload?.[0]?.[0]?.[0];
    if (!Array.isArray(quote)) return null;

    const symbolInfo = quote[1];
    const priceTuple = quote[5];
    const prevClose = quote[7];

    if (!Array.isArray(symbolInfo) || !Array.isArray(priceTuple) || typeof priceTuple[0] !== 'number') {
        return null;
    }

    return {
        symbol: cleanSymbol(symbolInfo[0]),
        data: {
            price: priceTuple[0],
            change: priceTuple[1] || 0,
            changePct: priceTuple[2] || 0,
            prevClose: prevClose || 0,
            source: 'google',
        } satisfies PriceData,
    };
}

function extractChartFromFrame(payload: any) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];
    const points = root[3]?.[0]?.[1];
    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || !points.length) return null;

    const lastPoint = points[points.length - 1];
    const changePct = lastPoint?.[1]?.[2];
    const close = lastPoint?.[1]?.[0];

    if (typeof changePct !== 'number' || !isFinite(changePct)) return null;

    return {
        symbol: cleanSymbol(symbolInfo[0]),
        data: { changePct: changePct * 100, close } satisfies IntervalData,
    };
}

function extractWideChartFromFrame(payload: any) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];
    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }
    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || !points.length) return null;

    const parseTime = (val: any) => {
        if (typeof val === 'number') return val;
        if (Array.isArray(val)) {
            const [y, m, d, h, minute] = val;
            return new Date(y, (m || 1) - 1, d || 1, h || 0, minute || 0).getTime();
        }
        return 0;
    };

    const series: { time: number; changePct: number; price: number; value: number }[] = points
        .map((point: any) => ({
            time: parseTime(point[0]),
            changePct: (point?.[1]?.[2] || 0) * 100,
            price: point?.[1]?.[0] || 0,
            value: 0,
        }))
        .filter((point) => isFinite(point.changePct) && point.time > 0)
        .sort((a, b) => a.time - b.time);

    series.forEach((point: any) => {
        point.value = point.changePct;
    });

    if (series.length > 0) {
        const startVal = series[0].value;
        series.forEach((point: any) => {
            point.value -= startVal;
        });
    }

    return {
        symbol: cleanSymbol(symbolInfo[0]),
        series,
    };
}

function extractFundaFromFrame(payload: any) {
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
        exchange: root[24],
    };
}

type QueueItem = {
    entry: any[];
    resolve: (value: any) => void;
    reject: (err: Error) => void;
};

let batchQueue: QueueItem[] = [];
let batchTimeout: ReturnType<typeof setTimeout> | null = null;
const pendingRpcRequests = new Map<string, Promise<any>>();
let warnedBatchFallback = false;
let warnedStrikeFallback = false;

async function flushBatch() {
    const queue = [...batchQueue];
    batchQueue = [];
    batchTimeout = null;

    if (!queue.length) return;

    const chunks: QueueItem[][] = [];
    for (let i = 0; i < queue.length; i += MAX_BATCH_SIZE) {
        chunks.push(queue.slice(i, i + MAX_BATCH_SIZE));
    }

    await Promise.all(
        chunks.map(async (chunk) => {
            const realtime: QueueItem[] = [];
            const cacheable: QueueItem[] = [];

            chunk.forEach((item) => {
                if (item.entry[0] === GOOGLE_RPC_PRICE) {
                    realtime.push(item);
                } else {
                    cacheable.push(item);
                }
            });

            const runGroup = async (group: QueueItem[]) => {
                if (!group.length) return;

                const isRealtimeGroup = group[0]?.entry?.[0] === GOOGLE_RPC_PRICE;
                const transportChunkSize = isRealtimeGroup ? EDGE_REALTIME_GROUP_SIZE : group.length;
                const transportGroups: QueueItem[][] = [];
                for (let i = 0; i < group.length; i += transportChunkSize) {
                    const seededGroup = group.slice(i, i + transportChunkSize);
                    transportGroups.push(seededGroup);
                }

                await Promise.all(
                    transportGroups.map(async (transportGroup) => {
                        const entries = transportGroup.map((item) => item.entry);
                        try {
                            const batchResult = await executeBatch(entries);
                            const frames = parseAllFrames(batchResult.text);

                            transportGroup.forEach((item, idx) => {
                                if (idx < frames.length && frames[idx]) {
                                    item.resolve({
                                        payload: frames[idx].payload,
                                        responseTtlMs: batchResult.responseTtlMs,
                                    });
                                } else {
                                    item.reject(new Error(`Missing frame for index ${idx} (got ${frames.length})`));
                                }
                            });
                        } catch (err: any) {
                            transportGroup.forEach((item) => item.reject(err));
                        }
                    }),
                );
            };

            await Promise.all([runGroup(realtime), runGroup(cacheable)]);
        }),
    );
}

function queueRpc(rpcId: string, rpcArgs: string) {
    const hash = `${rpcId}:${rpcArgs}`;
    if (pendingRpcRequests.has(hash)) {
        return pendingRpcRequests.get(hash)!;
    }

    const promise = new Promise((resolve, reject) => {
        batchQueue.push({
            entry: [rpcId, rpcArgs, null, 'generic'],
            resolve: (value) => {
                pendingRpcRequests.delete(hash);
                resolve(value);
            },
            reject: (err) => {
                pendingRpcRequests.delete(hash);
                reject(err);
            },
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

async function fetchFromStrike(symbol: string): Promise<PriceData | null> {
    const clean = cleanSymbol(symbol);
    if (/^\d+$/.test(clean)) return null;

    const encoded = encodeURIComponent(`EQ:${clean}`);
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');

    const toRaw = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}+05:30`;
    const fromRaw = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T09:15:00+05:30`;
    const parseStrikePayload = (data: any) => {
        const ticks = data?.data?.ticks?.[clean] || data?.data?.ticks?.[symbol.toUpperCase()];
        if (!Array.isArray(ticks) || !ticks.length) return null;

        const last = ticks[ticks.length - 1];
        const close = last?.[4];
        const open = last?.[1];
        if (typeof close !== 'number' || close <= 0) return null;

        return {
            price: close,
            change: close - (open || 0),
            changePct: open > 0 ? ((close - open) / open) * 100 : 0,
            prevClose: open || 0,
            source: 'strike',
        } satisfies PriceData;
    };

    if (STRIKE_PROXY_URL) {
        try {
            const response = await fetchWithTimeout(
                STRIKE_PROXY_URL,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fromStr: fromRaw,
                        toStr: toRaw,
                        encoded,
                        path: '/v2/api/equity/priceticks',
                    }),
                },
                15_000,
            );

            if (response.ok) {
                const data = await response.json();
                const parsed = parseStrikePayload(data);
                if (parsed) return parsed;
            }
        } catch {
            if (!warnedStrikeFallback) {
                console.warn('[PriceService] mobile-strike proxy unavailable, using direct Strike endpoint.');
                warnedStrikeFallback = true;
            }
        }
    }

    try {
        const strikeUrl =
            `https://api-v2.strike.money/v2/api/equity/priceticks?candleInterval=1d&from=${encodeURIComponent(fromRaw)}&to=${encodeURIComponent(toRaw)}&securities=${encoded}`;
        const response = await fetchWithTimeout(
            strikeUrl,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    'User-Agent': 'Mozilla/5.0',
                },
            },
            15_000,
        );
        if (!response.ok) return null;
        const data = await response.json();
        return parseStrikePayload(data);
    } catch {
        return null;
    }
}

export async function fetchLivePrices(symbols: string[]) {
    await cacheHydrationPromise;

    const keys = symbols.map((symbol) => cleanSymbol(symbol));
    const results = new Map<string, PriceData>();
    const uncached: string[] = [];

    keys.forEach((key) => {
        const cached = priceCache.get(key);
        if (isCacheRowFresh(cached, PRICE_CACHE_TTL) && cached) {
            markLocalCacheHit();
            results.set(key, cached.data);
        } else {
            markLocalCacheMiss();
            uncached.push(key);
        }
    });

    if (!uncached.length) return results;

    const requests = uncached.map((symbol) => {
        const exchange = getExchange(symbol);
        const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], 1]);

        return queueRpc(GOOGLE_RPC_PRICE, rpcArgs).then(({ payload, responseTtlMs }) => {
            const extracted = extractPriceFromFrame(payload);
            if (!extracted) return;
            results.set(extracted.symbol, extracted.data);
            const row = buildCacheRow(extracted.data, responseTtlMs, PRICE_CACHE_TTL);
            if (row) priceCache.set(extracted.symbol, row);
        });
    });

    try {
        await Promise.all(requests);
        schedulePriceSave();
    } catch {
        // best-effort: keep partial results
    }

    // Aggressive Parallel Fallback (Race Google vs Strike)
    const missing = uncached.filter((symbol) => !results.has(symbol) && !/^\d+$/.test(symbol));
    if (missing.length) {
        await Promise.allSettled(
            missing.map(async (symbol) => {
                const fallback = await fetchFromStrike(symbol);
                if (fallback && !results.has(symbol)) {
                    results.set(symbol, fallback);
                    const row = buildCacheRow(fallback, null, PRICE_CACHE_TTL);
                    if (row) priceCache.set(symbol, row);
                }
            }),
        );
        schedulePriceSave();
    }

    return results;
}

export async function fetchLivePrice(symbol: string) {
    const map = await fetchLivePrices([symbol]);
    return map.get(cleanSymbol(symbol)) || null;
}

const pendingIntervalReqs = new Map<string, Map<string, Promise<void>>>();
const intervalWaitTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function getCachedComparisonSeries(symbol: string, interval: string) {
    const clean = cleanSymbol(symbol);
    const window = INTERVAL_WINDOWS[interval] || 1;
    const cacheKey = `${clean}:${window}:full`;
    const cached = comparisonCacheMap.get(cacheKey);
    if (isCacheRowFresh(cached, COMPARISON_CACHE_TTL) && cached) {
        markLocalCacheHit();
        return cached.series;
    }
    markLocalCacheMiss();
    return null;
}

function deriveIntervalFromSeries(series: any[] | null | undefined): IntervalData | null {
    if (!series || series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const firstVal = typeof first?.value === 'number' ? first.value : first?.price;
    const lastVal = typeof last?.value === 'number' ? last.value : last?.price;
    if (typeof firstVal !== 'number' || typeof lastVal !== 'number' || firstVal <= 0) return null;

    const changePct = typeof last?.changePct === 'number'
        ? last.changePct
        : ((lastVal - firstVal) / firstVal) * 100;

    return {
        changePct,
        close: typeof last?.price === 'number' ? last.price : lastVal,
    };
}

export function fetchBatchIntervalPerformance(symbols: string[], interval = '1M') {
    const window = INTERVAL_WINDOWS[interval] || 3;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const cacheKeyBase = `${interval}:${window}`;

    if (!pendingIntervalReqs.has(cacheKeyBase)) {
        pendingIntervalReqs.set(cacheKeyBase, new Map());
    }
    const currentPending = pendingIntervalReqs.get(cacheKeyBase)!;

    const results = new Map<string, IntervalData>();
    const uncached: string[] = [];
    let derivedFromCharts = false;

    symbols.forEach((rawSymbol) => {
        const symbol = cleanSymbol(rawSymbol);
        const cacheKey = `${symbol}:${window}`;
        const cached = intervalCache.get(cacheKey);

        if (isCacheRowFresh(cached, ttl) && cached) {
            markLocalCacheHit();
            if (cached.data) results.set(symbol, cached.data);
            return;
        }

        const chartSeries = getCachedComparisonSeries(symbol, interval);
        const derived = deriveIntervalFromSeries(chartSeries);
        if (derived) {
            results.set(symbol, derived);
            const row = buildCacheRow(derived, null, ttl);
            if (row) intervalCache.set(cacheKey, row);
            derivedFromCharts = true;
            return;
        }

        if (!currentPending.has(symbol)) {
            markLocalCacheMiss();
            uncached.push(symbol);
        }
    });

    if (derivedFromCharts) scheduleIntervalSave();

    if (!uncached.length) {
        return new Promise<Map<string, IntervalData>>(async (resolve) => {
            const requestedPending = symbols.map(cleanSymbol).filter((symbol) => currentPending.has(symbol));
            if (requestedPending.length) {
                await Promise.all(requestedPending.map((symbol) => currentPending.get(symbol)!));
            }

            symbols.forEach((rawSymbol) => {
                const symbol = cleanSymbol(rawSymbol);
                const cached = intervalCache.get(`${symbol}:${window}`);
                if (cached?.data) results.set(symbol, cached.data);
            });

            resolve(results);
        });
    }

    let resolveBatch!: () => void;
    const batchPromise = new Promise<void>((resolve) => {
        resolveBatch = resolve;
    });

    uncached.forEach((symbol) => currentPending.set(symbol, batchPromise));

    if (intervalWaitTimers.has(cacheKeyBase)) {
        clearTimeout(intervalWaitTimers.get(cacheKeyBase)!);
    }

    intervalWaitTimers.set(
        cacheKeyBase,
        setTimeout(async () => {
            intervalWaitTimers.delete(cacheKeyBase);

            const allUncached = [...currentPending.keys()].filter((symbol) => {
                const cached = intervalCache.get(`${symbol}:${window}`);
                return !isCacheRowFresh(cached, ttl);
            });

            if (!allUncached.length) {
                resolveBatch();
                return;
            }

            const chunks: string[][] = [];
            const CHUNK_SIZE = 550;
            for (let i = 0; i < allUncached.length; i += CHUNK_SIZE) {
                chunks.push(allUncached.slice(i, i + CHUNK_SIZE));
            }

            await Promise.all(
                chunks.map(async (chunk) => {
                    const entries = chunk.map((symbol) => {
                        const exchange = getExchange(symbol);
                        const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], window, null, null, null, null, null, 0]);
                        return [GOOGLE_RPC_CHART, rpcArgs, null, 'generic'];
                    });

                    try {
                        const batchResult = await executeBatch(entries);
                        const frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
                        const returned = new Set<string>();

                        frames.forEach((frame) => {
                            const extracted = extractChartFromFrame(frame.payload);
                            if (!extracted) return;
                            const row = buildCacheRow(extracted.data, batchResult.responseTtlMs, ttl);
                            if (row) intervalCache.set(`${extracted.symbol}:${window}`, row);
                            returned.add(extracted.symbol);
                        });

                        chunk.forEach((symbol) => {
                            if (!returned.has(symbol)) {
                                const row = buildCacheRow(null, batchResult.responseTtlMs, ttl);
                                if (row) intervalCache.set(`${symbol}:${window}`, row);
                            }
                        });
                    } catch {
                        // keep going with other chunks
                    }
                }),
            );

            scheduleIntervalSave();
            currentPending.clear();
            resolveBatch();
        }, 50),
    );

    return batchPromise.then(() => {
        symbols.forEach((rawSymbol) => {
            const symbol = cleanSymbol(rawSymbol);
            const cached = intervalCache.get(`${symbol}:${window}`);
            if (cached?.data) results.set(symbol, cached.data);
        });

        return results;
    });
}

export async function fetchComparisonCharts(symbols: string[], interval = '1D') {
    await cacheHydrationPromise;

    const window = INTERVAL_WINDOWS[interval] || 1;
    const results = new Map<string, any[]>();
    const uncached: string[] = [];

    symbols.forEach((rawSymbol) => {
        const symbol = cleanSymbol(rawSymbol);
        const cacheKey = `${symbol}:${window}:full`;
        const cached = comparisonCacheMap.get(cacheKey);

        if (isCacheRowFresh(cached, COMPARISON_CACHE_TTL) && cached) {
            markLocalCacheHit();
            results.set(symbol, cached.series);
        } else {
            markLocalCacheMiss();
            uncached.push(symbol);
        }
    });

    if (!uncached.length) return results;

    const requests = uncached.map((symbol) => {
        const exchange = getExchange(symbol);
        const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], window, null, null, null, null, null, 0]);

        return queueRpc(GOOGLE_RPC_CHART, rpcArgs).then(({ payload, responseTtlMs }) => {
            const extracted = extractWideChartFromFrame(payload);
            if (!extracted) return;
            const cacheKey = `${extracted.symbol}:${window}:full`;
            const row = buildCacheRow(extracted.series, responseTtlMs, COMPARISON_CACHE_TTL);
            if (row) comparisonCacheMap.set(cacheKey, { series: row.data, timestamp: row.timestamp, ttlMs: row.ttlMs });
            results.set(extracted.symbol, extracted.series);
        });
    });

    try {
        await Promise.all(requests);
    } catch {
        // best-effort
    }

    return results;
}

export async function fetchUnifiedTrackerData(symbols: string[], interval = '1M', options: { cacheOnly?: boolean } = {}) {
    const cacheOnly = options?.cacheOnly === true;
    await cacheHydrationPromise;

    const keys = symbols.map((symbol) => cleanSymbol(symbol));
    const results = new Map<string, UnifiedData>();
    const uncachedKeys: string[] = [];

    keys.forEach((symbol) => {
        const cacheKey = `${interval}:${symbol}`;
        const cached = unifiedResultCache.get(cacheKey);
        if (isCacheRowFresh(cached, 300_000) && cached) {
            markLocalCacheHit();
            results.set(symbol, cached.data);
        } else {
            markLocalCacheMiss();
            uncachedKeys.push(symbol);
        }
    });

    if (!uncachedKeys.length) return results;

    if (cacheOnly) {
        uncachedKeys.forEach((symbol) => {
            const series = getCachedComparisonSeries(symbol, '1Y');
            if (!series || series.length < 5) return;

            const prices = series.map((point: any) => point.price).filter((price: any) => typeof price === 'number' && price > 0);
            if (prices.length < 5) return;

            const currentPrice = prices[prices.length - 1];
            const dayIndices: Record<string, number> = { '1D': 1, '5D': 5, '1M': 20, '6M': 125, '1Y': 250, YTD: 250 };
            const lookback = dayIndices[interval] || 20;
            const startIndex = Math.max(0, prices.length - 1 - lookback);
            const startPrice = prices[startIndex];

            const changePct = startPrice > 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;

            const ema10 = calculateEMA(prices, 10);
            const ema21 = calculateEMA(prices, 21);
            const ema50 = calculateEMA(prices, 50);
            const ema150 = calculateEMA(prices, 150);
            const ema200 = calculateEMA(prices, 200);

            const data: UnifiedData = {
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
                    ema200,
                },
                hasBreadth: true,
            };

            const row = buildCacheRow(data, null, 300_000);
            if (row) unifiedResultCache.set(`${interval}:${symbol}`, row);
            results.set(symbol, data);
        });

        return results;
    }

    const charts = await fetchComparisonCharts(uncachedKeys, '1Y');

    uncachedKeys.forEach((symbol) => {
        const series = charts.get(symbol);
        if (!series || series.length < 5) return;

        const prices = series.map((point: any) => point.price).filter((price: any) => typeof price === 'number' && price > 0);
        if (prices.length < 5) return;

        const currentPrice = prices[prices.length - 1];
        const dayIndices: Record<string, number> = { '1D': 1, '5D': 5, '1M': 20, '6M': 125, '1Y': 250, YTD: 250 };
        const lookback = dayIndices[interval] || 20;
        const startIndex = Math.max(0, prices.length - 1 - lookback);
        const startPrice = prices[startIndex];

        const changePct = startPrice > 0 ? ((currentPrice - startPrice) / startPrice) * 100 : 0;

        const ema10 = calculateEMA(prices, 10);
        const ema21 = calculateEMA(prices, 21);
        const ema50 = calculateEMA(prices, 50);
        const ema150 = calculateEMA(prices, 150);
        const ema200 = calculateEMA(prices, 200);

        const data: UnifiedData = {
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
                ema200,
            },
        };

        const row = buildCacheRow(data, null, 300_000);
        if (row) unifiedResultCache.set(`${interval}:${symbol}`, row);
        results.set(symbol, data);
    });

    return results;
}

export async function fetchFundamentals(symbols: string[]) {
    await cacheHydrationPromise;

    const keys = symbols.map((symbol) => cleanSymbol(symbol));
    const results = new Map<string, any>();
    const uncached: string[] = [];

    keys.forEach((key) => {
        const cached = fundaCache.get(key);
        if (isCacheRowFresh(cached, FUNDA_CACHE_TTL) && cached) {
            markLocalCacheHit();
            results.set(key, cached.data);
        } else {
            markLocalCacheMiss();
            uncached.push(key);
        }
    });

    if (!uncached.length) return results;

    for (let i = 0; i < uncached.length; i += MAX_BATCH_SIZE) {
        const chunk = uncached.slice(i, i + MAX_BATCH_SIZE);
        const entries = chunk.map((symbol) => {
            const exchange = getExchange(symbol);
            const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]]]);
            return [GOOGLE_RPC_FUNDAMENTALS, rpcArgs, null, 'generic'];
        });

        try {
            const batchResult = await executeBatch(entries);
            const frames = parseAllFrames(batchResult.text).filter((frame) => frame.rpcId === GOOGLE_RPC_FUNDAMENTALS);

            for (let j = 0; j < chunk.length; j++) {
                const frame = frames[j];
                const symbol = chunk[j];
                if (!frame) continue;

                const extracted = extractFundaFromFrame(frame.payload);
                if (!extracted) continue;

                results.set(symbol, extracted);
                const row = buildCacheRow(extracted, batchResult.responseTtlMs, FUNDA_CACHE_TTL);
                if (row) fundaCache.set(symbol, row);
            }
            scheduleFundaSave();
        } catch {
            // keep partial success from other batches
        }
    }

    return results;
}

export async function clearPriceCache() {
    priceCache.clear();
    intervalCache.clear();
    fundaCache.clear();
    comparisonCacheMap.clear();
    unifiedResultCache.clear();

    await Promise.all([
        AsyncStorage.removeItem(PRICE_CACHE_KEY),
        AsyncStorage.removeItem(INTERVAL_CACHE_KEY),
        AsyncStorage.removeItem(FUNDA_CACHE_KEY),
    ]);
}

export function getCachedInterval(symbol: string, interval: string) {
    const key = cleanSymbol(symbol);
    const window = INTERVAL_WINDOWS[interval] || 3;
    const cacheKey = `${key}:${window}`;
    const ttl = INTERVAL_CACHE_TTL[interval] || 300_000;
    const cached = intervalCache.get(cacheKey);

    if (isCacheRowFresh(cached, ttl) && cached) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss();
    return null;
}

export function getCachedPrice(symbol: string) {
    const key = cleanSymbol(symbol);
    const cached = priceCache.get(key);
    if (isCacheRowFresh(cached, PRICE_CACHE_TTL) && cached) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss();
    return null;
}

export function getCachedFundamentals(symbol: string) {
    const key = cleanSymbol(symbol);
    const cached = fundaCache.get(key);
    if (isCacheRowFresh(cached, FUNDA_CACHE_TTL) && cached) {
        markLocalCacheHit();
        return cached.data;
    }
    markLocalCacheMiss();
    return null;
}

export async function fetchTechnicalBreadth(symbols: string[]) {
    const keys = symbols.map((symbol) => cleanSymbol(symbol));
    const charts = await fetchComparisonCharts(keys, '1Y');

    let above21EMA = 0;
    let above50SMA = 0;
    let above150SMA = 0;
    let above200SMA = 0;
    let validCount = 0;

    keys.forEach((symbol) => {
        const series = charts.get(symbol);
        if (!series || series.length < 5) return;

        const prices = series.map((point: any) => point.price).filter((price: any) => price > 0);
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
        total: symbols.length,
    };
}
