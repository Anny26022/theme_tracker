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

const PRICE_CACHE_KEY = 'tt_price_cache:v1';
const INTERVAL_CACHE_KEY = 'tt_interval_cache:v1';
const FUNDA_CACHE_KEY = 'tt_funda_cache:v1';

const PRICE_CACHE_TTL = 15_000;
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

const comparisonCacheMap = new Map<string, { series: any[]; timestamp: number }>();
const unifiedResultCache = new Map<string, { data: UnifiedData; timestamp: number }>();
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
    if (!entries.length) return '';

    const rpcIds = [...new Set(entries.map((entry) => entry[0]))] as string[];
    const fReq = JSON.stringify([entries]);
    const body = new URLSearchParams({ 'f.req': fReq }).toString();

    if (BATCH_PROXY_URL) {
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

            return response.text();
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

    return directResponse.text();
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
            const entries = chunk.map((item) => item.entry);
            try {
                const text = await executeBatch(entries);
                const frames = parseAllFrames(text);

                chunk.forEach((item, idx) => {
                    if (idx < frames.length && frames[idx]) {
                        item.resolve(frames[idx].payload);
                    } else {
                        item.reject(new Error(`Missing frame for index ${idx} (got ${frames.length})`));
                    }
                });
            } catch (err: any) {
                chunk.forEach((item) => item.reject(err));
            }
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
        if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
            results.set(key, cached.data);
        } else {
            uncached.push(key);
        }
    });

    if (!uncached.length) return results;

    const requests = uncached.map((symbol) => {
        const exchange = getExchange(symbol);
        const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], 1]);

        return queueRpc(GOOGLE_RPC_PRICE, rpcArgs).then((payload) => {
            const extracted = extractPriceFromFrame(payload);
            if (!extracted) return;
            results.set(extracted.symbol, extracted.data);
            priceCache.set(extracted.symbol, { data: extracted.data, timestamp: Date.now() });
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
                    priceCache.set(symbol, { data: fallback, timestamp: Date.now() });
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

    symbols.forEach((rawSymbol) => {
        const symbol = cleanSymbol(rawSymbol);
        const cacheKey = `${symbol}:${window}`;
        const cached = intervalCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < ttl) {
            if (cached.data) results.set(symbol, cached.data);
        } else if (!currentPending.has(symbol)) {
            uncached.push(symbol);
        }
    });

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
                return !(cached && Date.now() - cached.timestamp < ttl);
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
                        const text = await executeBatch(entries);
                        const frames = parseAllFrames(text).filter((frame) => frame.rpcId === GOOGLE_RPC_CHART);
                        const returned = new Set<string>();

                        frames.forEach((frame) => {
                            const extracted = extractChartFromFrame(frame.payload);
                            if (!extracted) return;
                            intervalCache.set(`${extracted.symbol}:${window}`, { data: extracted.data, timestamp: Date.now() });
                            returned.add(extracted.symbol);
                        });

                        chunk.forEach((symbol) => {
                            if (!returned.has(symbol)) {
                                intervalCache.set(`${symbol}:${window}`, { data: null, timestamp: Date.now() });
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

        if (cached && Date.now() - cached.timestamp < 120_000) {
            results.set(symbol, cached.series);
        } else {
            uncached.push(symbol);
        }
    });

    if (!uncached.length) return results;

    const requests = uncached.map((symbol) => {
        const exchange = getExchange(symbol);
        const rpcArgs = JSON.stringify([[[null, [symbol, exchange]]], window, null, null, null, null, null, 0]);

        return queueRpc(GOOGLE_RPC_CHART, rpcArgs).then((payload) => {
            const extracted = extractWideChartFromFrame(payload);
            if (!extracted) return;
            const cacheKey = `${extracted.symbol}:${window}:full`;
            comparisonCacheMap.set(cacheKey, { series: extracted.series, timestamp: Date.now() });
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

export async function fetchUnifiedTrackerData(symbols: string[], interval = '1M') {
    await cacheHydrationPromise;

    const keys = symbols.map((symbol) => cleanSymbol(symbol));
    const results = new Map<string, UnifiedData>();
    const uncachedKeys: string[] = [];

    keys.forEach((symbol) => {
        const cacheKey = `${interval}:${symbol}`;
        const cached = unifiedResultCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < 300_000) {
            results.set(symbol, cached.data);
        } else {
            uncachedKeys.push(symbol);
        }
    });

    if (!uncachedKeys.length) return results;

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

        unifiedResultCache.set(`${interval}:${symbol}`, { data, timestamp: Date.now() });
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
        if (cached && Date.now() - cached.timestamp < FUNDA_CACHE_TTL) {
            results.set(key, cached.data);
        } else {
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
            const text = await executeBatch(entries);
            const frames = parseAllFrames(text).filter((frame) => frame.rpcId === GOOGLE_RPC_FUNDAMENTALS);

            for (let j = 0; j < chunk.length; j++) {
                const frame = frames[j];
                const symbol = chunk[j];
                if (!frame) continue;

                const extracted = extractFundaFromFrame(frame.payload);
                if (!extracted) continue;

                results.set(symbol, extracted);
                fundaCache.set(symbol, { data: extracted, timestamp: Date.now() });
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

    if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
    }
    return null;
}

export function getCachedPrice(symbol: string) {
    const key = cleanSymbol(symbol);
    const cached = priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        return cached.data;
    }
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
