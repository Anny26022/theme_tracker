/**
 * Live Price Service — Maximally Batched
 * 
 * VERIFIED by curl:
 *   - xh8wxf (price) + AiCwsd (chart) can be MIXED in ONE batchexecute call
 *   - 30 symbols in 0.69s ✅
 *   - Flat array format: [[call1, call2, ...]] — critical
 *
 * Call reduction:
 *   Before: 1,144 HTTP requests per tracker interval switch
 *   After:  ~10 HTTP requests (286 sectors / 30 per batch)
 */

const GOOGLE_RPC_PRICE = 'xh8wxf';
const GOOGLE_RPC_CHART = 'AiCwsd';
const GOOGLE_RPC_FUNDAMENTALS = 'HqGpWd';
const GOOGLE_BATCH_PATH = '/api/google-finance/finance/_/GoogleFinanceUi/data/batchexecute';
const MAX_BATCH_SIZE = 100; // Verified: 100/100 returned in 0.89s

// ─── Persistent Caches (survive page refresh via sessionStorage) ──

const PRICE_CACHE_KEY = 'tt_price_cache';
const INTERVAL_CACHE_KEY = 'tt_interval_cache';
const FUNDA_CACHE_KEY = 'tt_funda_cache';
const PRICE_CACHE_TTL = 15_000; // 15s
const FUNDA_CACHE_TTL = 3600_000; // 1 hour (fundamentals move slowly)

// Hydrate from sessionStorage on load
function loadCache(storageKey) {
    try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) return new Map(JSON.parse(raw));
    } catch { /* ignore corrupt data */ }
    return new Map();
}

function saveCache(cache, storageKey) {
    try {
        sessionStorage.setItem(storageKey, JSON.stringify([...cache]));
    } catch { /* storage full — ignore */ }
}

const priceCache = loadCache(PRICE_CACHE_KEY);
const intervalCache = loadCache(INTERVAL_CACHE_KEY);
const fundaCache = loadCache(FUNDA_CACHE_KEY);

// Debug: log hydration on module load
console.debug(`[PriceCache] Hydrated from sessionStorage — prices: ${priceCache.size}, intervals: ${intervalCache.size}, funda: ${fundaCache.size}`);

// Debounced save to avoid thrashing sessionStorage
let priceSaveTimer = null;
let intervalSaveTimer = null;
let fundaSaveTimer = null;

function schedulePriceSave() {
    if (priceSaveTimer) clearTimeout(priceSaveTimer);
    priceSaveTimer = setTimeout(() => saveCache(priceCache, PRICE_CACHE_KEY), 500);
}

function scheduleIntervalSave() {
    if (intervalSaveTimer) clearTimeout(intervalSaveTimer);
    intervalSaveTimer = setTimeout(() => saveCache(intervalCache, INTERVAL_CACHE_KEY), 500);
}

function scheduleFundaSave() {
    if (fundaSaveTimer) clearTimeout(fundaSaveTimer);
    fundaSaveTimer = setTimeout(() => saveCache(fundaCache, FUNDA_CACHE_KEY), 500);
}

export const INTERVAL_WINDOWS = {
    '1D': 1, '5D': 2, '1M': 3, '6M': 4,
    'YTD': 5, '1Y': 6, '5Y': 7, 'MAX': 8
};

const INTERVAL_CACHE_TTL = {
    '1D': 300_000,     // 5 min
    '5D': 300_000,     // 5 min
    '1M': 600_000,     // 10 min
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

/**
 * Normalize symbols for caching.
 * Example: RELIANCE:NSE -> RELIANCE, 542802.BO -> 542802
 */
export function cleanSymbol(symbol) {
    if (!symbol) return '';
    return symbol.trim().toUpperCase()
        .replace(/\.(NS|BO)$/i, '')
        .replace(/:(NSE|BOM)$/i, '')
        .replace(/-EQ$/i, '');
}

function buildBatchUrl(rpcIds) {
    const params = new URLSearchParams({
        rpcids: rpcIds.join(','),
        'source-path': '/finance/',
        'f.sid': 'dummy',
        hl: 'en-US',
        'soc-app': '162',
        'soc-platform': '1',
        'soc-device': '1',
        rt: 'c',
    });
    return `${GOOGLE_BATCH_PATH}?${params.toString()}`;
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

    // Google limits batchexecute entries. We chunk by MAX_BATCH_SIZE.
    for (let i = 0; i < queue.length; i += MAX_BATCH_SIZE) {
        const chunk = queue.slice(i, i + MAX_BATCH_SIZE);
        const entries = chunk.map(q => q.entry);

        try {
            const text = await executeBatch(entries);
            const frames = parseAllFrames(text);

            // Map frames back to their original promises
            // Frames in batchexecute are returned as separate lines.
            // We match by index if possible, or by rpcId + symbol if we parsed correctly.
            // Actually Google returns rpcId and index.

            chunk.forEach((q, idx) => {
                // Find matching frame for this specific request in the batch
                // NOTE: Google doesn't easily map index back in raw text, 
                // but frames usually appear in request order.
                const frame = frames[idx];
                if (frame && frame.rpcId === q.entry[0]) {
                    q.resolve(frame.payload);
                } else {
                    // Fallback to rpcId search if order is scrambled
                    const match = frames.find(f => f.rpcId === q.entry[0]);
                    if (match) q.resolve(match.payload);
                    else q.reject(new Error('No matching frame'));
                }
            });
        } catch (err) {
            chunk.forEach(q => q.reject(err));
        }
    }
}

function queueRpc(rpcId, rpcArgs) {
    return new Promise((resolve, reject) => {
        batchQueue.push({
            entry: [rpcId, rpcArgs, null, 'generic'],
            resolve,
            reject
        });

        if (!batchTimeout) {
            batchTimeout = setTimeout(flushBatch, 50); // 50ms window to bundle
        }
    });
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

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
        body: new URLSearchParams({ 'f.req': fReq }).toString(),
        signal: AbortSignal.timeout?.(timeoutMs),
    });

    if (!response.ok) throw new Error(`Batch failed: ${response.status}`);
    return response.text();
}

/**
 * Parse all wrb.fr frames from a batchexecute response.
 * Returns array of { rpcId, payload } objects.
 */
function parseAllFrames(text) {
    const frames = [];
    const lines = text.split('\n').map(l => l.trim()).filter(
        l => l.startsWith('[[') && l.includes('"wrb.fr"')
    );

    for (const line of lines) {
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

function extractChartFromFrame(payload) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0]; // ["RELIANCE", "NSE"]
    const points = root[3]?.[0]?.[1];
    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || points.length === 0) return null;

    const lastPoint = points[points.length - 1];
    const changePct = lastPoint?.[1]?.[2];
    const close = lastPoint?.[1]?.[0];

    if (typeof changePct !== 'number' || !isFinite(changePct)) return null;

    return {
        symbol: symbolInfo[0],
        data: { changePct: changePct * 100, close }
    };
}

/**
 * Extract FULL time-series from AiCwsd frame.
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
        value: (p?.[1]?.[2] || 0) * 100
    })).filter(p => isFinite(p.value) && p.time > 0)
        .sort((a, b) => a.time - b.time);

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

    for (const base of ['/api/strike', 'https://api-v2.strike.money']) {
        try {
            const url = `${base}/v2/api/equity/priceticks?candleInterval=1d&from=${fromStr}&to=${toStr}&securities=${encoded}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' },
                signal: AbortSignal.timeout?.(5000),
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

    console.debug(`[PriceCache] PRICES — ✅ ${results.size} cache hits, ❌ ${uncached.length} cache misses`, uncached.length ? uncached.slice(0, 5).join(', ') + (uncached.length > 5 ? '...' : '') : '');

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

    // Strike fallback for missing NSE symbols only
    const missing = uncached.filter(s => !results.has(s) && !/^\d+$/.test(s));
    if (missing.length > 0) {
        await Promise.allSettled(missing.map(async (sym) => {
            const data = await fetchFromStrike(sym);
            if (data) {
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

        console.debug(`[PriceService] Consolidating Interval ${interval} — Batching ${allUncached.length} symbols`);

        // Larger batch size for performance charts (small payload)
        const CHUNK_SIZE = 250;
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
                    const extracted = extractChartFromFrame(frame.payload);
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
 * Fetch interval change % for a single symbol.
 */
export async function fetchIntervalPerformance(symbol, interval = '1M') {
    const map = await fetchBatchIntervalPerformance([symbol], interval);
    return map.get(cleanSymbol(symbol)) || null;
}

// ─── Fundamentals Extraction (HqGpWd) ──────────────────────────────

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
const comparisonCacheMap = new Map();

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
