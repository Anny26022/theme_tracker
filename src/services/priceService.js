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
const IS_DEV = import.meta.env?.DEV;

// ─── Persistent Caches (survive page refresh via sessionStorage) ──

const PRICE_CACHE_KEY = 'tt_price_cache:v1';
const INTERVAL_CACHE_KEY = 'tt_interval_cache:v1';
const FUNDA_CACHE_KEY = 'tt_funda_cache:v1';

const comparisonCacheMap = new Map();
const unifiedResultCache = new Map(); // timeframe:symbol -> result
const pendingUnifiedRequests = new Map();
const PRICE_CACHE_TTL = 15_000; // 15s
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
 * Coalesces ALL rpc calls (price, chart, funda) into ONE single HTTP POST.
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
        const entries = chunk.map(q => q.entry);
        try {
            const text = await executeBatch(entries);
            const frames = parseAllFrames(text);

            chunk.forEach((q, idx) => {
                if (idx < frames.length && frames[idx]) {
                    q.resolve(frames[idx].payload);
                } else {
                    q.reject(new Error(`Missing frame for index ${idx} (got ${frames.length} frames)`));
                }
            });
        } catch (err) {
            chunk.forEach(q => q.reject(err));
        }
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
 * Returns raw response text.
 */
async function executeBatch(entries, timeoutMs = 12000) {
    if (entries.length === 0) return '';

    const rpcIds = [...new Set(entries.map(e => e[0]))];
    const url = buildBatchUrl(rpcIds);
    const fReq = JSON.stringify([entries]);

    // AES-256-GCM encrypt — completely unreadable in DevTools
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
    return response.text();
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
        if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
            results.set(key, cached.data);
        } else {
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
        return queueRpc(GOOGLE_RPC_PRICE, rpcArgs).then(payload => {
            const extracted = extractPriceFromFrame(payload);
            if (extracted) {
                results.set(extracted.symbol, extracted.data);
                priceCache.set(extracted.symbol, { data: extracted.data, timestamp: Date.now() });
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
                priceCache.set(sym, { data, timestamp: Date.now() });
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

        if (cached && Date.now() - cached.timestamp < ttl) {
            if (cached.data !== null) results.set(sym, cached.data);
        } else if (!currentPending.has(sym)) {
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
            return !(c && Date.now() - c.timestamp < ttl);
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
                const text = await executeBatch(entries);
                const frames = parseAllFrames(text).filter(f => f.rpcId === GOOGLE_RPC_CHART);
                const returned = new Set();

                frames.forEach(frame => {
                    const extracted = extractChartFromFrame(frame.payload, interval);
                    if (extracted) {
                        const cacheKey = `${extracted.symbol}:${window}`;
                        intervalCache.set(cacheKey, { data: extracted.data, timestamp: Date.now() });
                        returned.add(extracted.symbol);
                    }
                });

                // Negative cache
                chunk.forEach(sym => {
                    if (!returned.has(sym)) {
                        intervalCache.set(`${sym}:${window}`, { data: null, timestamp: Date.now() });
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
            if (cached && Date.now() - cached.timestamp < 300_000) {
                results.set(sym, cached.data);
            } else {
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

            unifiedResultCache.set(`${interval}:${sym}`, { data, timestamp: Date.now() });
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
        if (cached && Date.now() - cached.timestamp < FUNDA_CACHE_TTL) {
            results.set(key, cached.data);
        } else {
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
            const text = await executeBatch(entries);
            const frames = parseAllFrames(text).filter(f => f.rpcId === GOOGLE_RPC_FUNDAMENTALS);

            // Google returns frames in request order for the same RPC ID
            for (let j = 0; j < chunk.length; j++) {
                const frame = frames[j];
                const symbol = chunk[j];
                if (!frame) continue;

                const extracted = extractFundaFromFrame(frame.payload);
                if (extracted) {
                    results.set(symbol, extracted);
                    fundaCache.set(symbol, { data: extracted, timestamp: Date.now() });
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
        if (cached && Date.now() - cached.timestamp < 120_000) {
            results.set(sym, cached.series);
        } else {
            uncached.push(sym);
        }
    }

    if (uncached.length === 0) return results;

    // Use dispatcher for Comparison Charts
    const requests = uncached.map(sym => {
        const ex = getExchange(sym);
        const rpcArgs = JSON.stringify([[[null, [sym, ex]]], window, null, null, null, null, null, 0]);
        return queueRpc(GOOGLE_RPC_CHART, rpcArgs).then(payload => {
            const extracted = extractWideChartFromFrame(payload);
            if (extracted) {
                const cacheKey = `${extracted.symbol}:${window}:full`;
                comparisonCacheMap.set(cacheKey, { series: extracted.series, timestamp: Date.now() });
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
    if (cached && Date.now() - cached.timestamp < ttl) {
        return cached.data;
    }
    return null;
}

/**
 * Read cached price data synchronously (no fetch).
 */
export function getCachedPrice(symbol) {
    const key = cleanSymbol(symbol);
    const cached = priceCache.get(key);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        return cached.data;
    }
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
