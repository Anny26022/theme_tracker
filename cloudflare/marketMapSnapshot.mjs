import rawMarketData from '../public/data.json' with { type: 'json' };
import { buildHierarchyFromRawData } from '../packages/core/src/market/hierarchy.ts';
import { THEMATIC_MAP } from '../src/data/thematicMap.js';
import { RPC_CHART, RPC_PRICE } from '../src/lib/stealth.js';

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];
const SNAPSHOT_KEY_PREFIX = 'market-map/snapshots';
const PRICE_BATCH_SIZE = 500;
const CHART_BATCH_SIZE = 250;
const CHART_CONCURRENCY = 3;
const CHART_WINDOW = 6; // 1Y base series
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=900';
const GOOGLE_HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    Origin: 'https://www.google.com',
    Referer: 'https://www.google.com/finance/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

function cleanSymbol(symbol) {
    if (!symbol) return '';
    return String(symbol)
        .trim()
        .toUpperCase()
        .replace(/^(NSE|BSE|BOM|GOOGLE):/i, '')
        .replace(/:(NSE|BOM|BSE)$/i, '')
        .replace(/\.(NS|BO)$/i, '')
        .replace(/-EQ$/i, '')
        .split(':')[0];
}

function isBseSymbol(symbol) {
    const clean = cleanSymbol(symbol);
    return /^\d+$/.test(clean) || clean.includes(':BSE');
}

function getExchange(symbol) {
    return /^\d+$/.test(cleanSymbol(symbol)) ? 'BOM' : 'NSE';
}

function buildGoogleBatchUrl(rpcIds) {
    const rpc = encodeURIComponent([...new Set(rpcIds)].join(','));
    return `https://www.google.com/finance/_/GoogleFinanceUi/data/batchexecute?rpcids=${rpc}&source-path=%2Ffinance%2F&f.sid=dummy&hl=en-US&soc-app=162&soc-platform=1&soc-device=1&rt=c`;
}

async function executeGoogleBatch(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return '';

    const rpcIds = [...new Set(entries.map((entry) => entry[0]).filter(Boolean))];
    const response = await fetch(buildGoogleBatchUrl(rpcIds), {
        method: 'POST',
        headers: GOOGLE_HEADERS,
        body: new URLSearchParams({ 'f.req': JSON.stringify([entries]) }).toString(),
    });

    if (!response.ok) {
        throw new Error(`Google batch failed: ${response.status}`);
    }

    return response.text();
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
                } catch {
                    // Ignore malformed frame payloads.
                }
            }
        } catch {
            // Ignore malformed lines.
        }
    }

    return frames;
}

function extractPriceFromFrame(payload) {
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
        }
    };
}

function extractCloseSeriesFromFrame(payload) {
    const root = payload?.[0]?.[0];
    if (!Array.isArray(root)) return null;

    const symbolInfo = root[0];
    const absolutePrice = Number(symbolInfo?.[2]);

    let points = root[3]?.[0]?.[1];
    if (!Array.isArray(points) || points.length < 2) {
        points = root[3]?.[1];
    }

    if (!Array.isArray(symbolInfo) || !Array.isArray(points) || points.length === 0) {
        return null;
    }

    const parseTime = (value) => {
        if (typeof value === 'number') return value;
        if (Array.isArray(value)) {
            const [year, month, day, hour, minute] = value;
            return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
        }
        return 0;
    };

    const rawSeries = points
        .map((point) => {
            const stats = point?.[1];
            const time = parseTime(point?.[0]);
            const close = Number(stats?.[0] || 0);
            return { time, close };
        })
        .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.close) && point.close > 0)
        .sort((a, b) => a.time - b.time);

    if (rawSeries.length === 0) return null;

    const lastRawClose = rawSeries[rawSeries.length - 1]?.close || 0;
    const needsScaling = absolutePrice > 5 && lastRawClose > 0 && Math.abs(lastRawClose - absolutePrice) > absolutePrice * 0.5;
    const scaleFactor = needsScaling ? (absolutePrice / lastRawClose) : 1;
    const series = rawSeries.map((point) => ({
        time: point.time,
        close: point.close * scaleFactor
    }));

    return {
        symbol: cleanSymbol(symbolInfo[0]),
        series
    };
}

function deriveIntervalPerfFromBaseSeries(series, interval, currentPriceOverride) {
    if (!Array.isArray(series) || series.length < 2) return null;

    const points = series
        .map((point) => ({
            time: Number(point?.time || 0),
            close: Number(point?.close),
        }))
        .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.close) && point.close > 0)
        .sort((a, b) => a.time - b.time);

    if (points.length < 2) return null;

    const currentPrice = Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
        ? currentPriceOverride
        : points[points.length - 1].close;

    let anchor = null;
    if (interval === 'YTD') {
        const year = new Date(points[points.length - 1].time).getUTCFullYear();
        anchor = points.find((point) => new Date(point.time).getUTCFullYear() === year)?.close ?? points[0]?.close ?? null;
    } else {
        const lookbackBars = {
            '5D': 5,
            '1M': 21,
            '3M': 63,
            '6M': 126,
            '1Y': 252,
        }[interval];

        if (!Number.isFinite(lookbackBars)) return null;
        const anchorIndex = Math.max(0, points.length - 1 - lookbackBars);
        anchor = points[anchorIndex]?.close ?? null;
    }

    if (!(anchor > 0) || !(currentPrice > 0)) return null;

    return {
        changePct: ((currentPrice - anchor) / anchor) * 100,
        close: currentPrice,
    };
}

function deriveOneDayPerf(liveData, series) {
    if (liveData && typeof liveData.changePct === 'number') {
        return {
            changePct: liveData.changePct,
            close: liveData.price,
        };
    }

    if (!Array.isArray(series) || series.length < 2) return null;
    const points = series
        .map((point) => Number(point?.close))
        .filter((value) => Number.isFinite(value) && value > 0);

    if (points.length < 2) return null;
    const previousClose = points[points.length - 2];
    const currentPrice = points[points.length - 1];
    if (!(previousClose > 0) || !(currentPrice > 0)) return null;

    return {
        changePct: ((currentPrice - previousClose) / previousClose) * 100,
        close: currentPrice,
    };
}

function buildIndustryMap(sourceHierarchy) {
    const industryMap = {};
    Object.values(sourceHierarchy || {}).forEach((industries) => {
        if (!industries) return;
        Object.entries(industries).forEach(([industryName, companies]) => {
            industryMap[industryName] = companies;
        });
    });
    return industryMap;
}

function buildThemeToSymbols(sourceHierarchy, { includeBse = true } = {}) {
    const industryMap = buildIndustryMap(sourceHierarchy);
    const themeToSymbols = new Map();
    const assigned = new Set();
    const allSymbolsSet = new Set();

    const registerSymbol = (themeName, rawSymbol) => {
        const symbol = cleanSymbol(rawSymbol);
        if (!symbol) return;
        if (!includeBse && isBseSymbol(symbol)) return;
        if (assigned.has(symbol)) return;
        assigned.add(symbol);
        if (!themeToSymbols.has(themeName)) themeToSymbols.set(themeName, new Set());
        themeToSymbols.get(themeName).add(symbol);
        allSymbolsSet.add(symbol);
    };

    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!themeToSymbols.has(theme.name)) themeToSymbols.set(theme.name, new Set());
            (theme.symbols || []).forEach((symbol) => registerSymbol(theme.name, symbol));
        });
    });

    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!themeToSymbols.has(theme.name)) themeToSymbols.set(theme.name, new Set());
            (theme.industries || []).forEach((industryName) => {
                const companies = industryMap[industryName] || [];
                companies.forEach((company) => registerSymbol(theme.name, company?.symbol));
            });
        });
    });

    const finalizedThemeToSymbols = new Map();
    themeToSymbols.forEach((symbols, themeName) => {
        finalizedThemeToSymbols.set(themeName, Array.from(symbols));
    });

    return {
        themeToSymbols: finalizedThemeToSymbols,
        allSymbols: Array.from(allSymbolsSet),
    };
}

async function runInChunks(items, chunkSize, worker, concurrency = 1) {
    const chunks = [];
    for (let index = 0; index < items.length; index += chunkSize) {
        chunks.push(items.slice(index, index + chunkSize));
    }

    let cursor = 0;
    const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (cursor < chunks.length) {
            const currentIndex = cursor;
            cursor += 1;
            await worker(chunks[currentIndex], currentIndex);
        }
    });

    await Promise.all(runners);
}

async function fetchLivePriceMap(symbols) {
    const results = new Map();

    await runInChunks(symbols, PRICE_BATCH_SIZE, async (chunk) => {
        try {
            const entries = chunk.map((symbol) => [
                RPC_PRICE,
                JSON.stringify([[[null, [symbol, getExchange(symbol)]]], 1]),
                null,
                'generic'
            ]);

            const text = await executeGoogleBatch(entries);
            parseAllFrames(text)
                .filter((frame) => frame.rpcId === RPC_PRICE)
                .forEach((frame) => {
                    const extracted = extractPriceFromFrame(frame.payload);
                    if (extracted) results.set(extracted.symbol, extracted.data);
                });
        } catch {
            // Keep snapshot generation best-effort; missing chunks reduce coverage but should
            // not prevent serving the rest of the map.
        }
    }, 2);

    return results;
}

async function fetchBaseChartSeriesMap(symbols) {
    const results = new Map();

    await runInChunks(symbols, CHART_BATCH_SIZE, async (chunk) => {
        try {
            const entries = chunk.map((symbol) => [
                RPC_CHART,
                JSON.stringify([[[null, [symbol, getExchange(symbol)]]], CHART_WINDOW, null, null, null, null, null, 0]),
                null,
                'generic'
            ]);

            const text = await executeGoogleBatch(entries);
            parseAllFrames(text)
                .filter((frame) => frame.rpcId === RPC_CHART)
                .forEach((frame) => {
                    const extracted = extractCloseSeriesFromFrame(frame.payload);
                    if (extracted) results.set(extracted.symbol, extracted.series);
                });
        } catch {
            // Keep snapshot generation best-effort; missing chunks reduce coverage but should
            // not prevent serving the rest of the map.
        }
    }, CHART_CONCURRENCY);

    return results;
}

function aggregateHeatmap(themeToSymbols, perfByInterval) {
    const heatmapData = {};

    themeToSymbols.forEach((symbols, themeName) => {
        const intervalMap = {};

        SNAPSHOT_INTERVALS.forEach((interval) => {
            const perfMap = perfByInterval.get(interval) || new Map();
            let sum = 0;
            let validCount = 0;

            symbols.forEach((symbol) => {
                const data = perfMap.get(symbol);
                if (!data || typeof data.changePct !== 'number' || !Number.isFinite(data.changePct)) return;
                sum += data.changePct;
                validCount += 1;
            });

            intervalMap[interval] = validCount > 0 ? (sum / validCount) : null;
        });

        heatmapData[themeName] = intervalMap;
    });

    return heatmapData;
}

function buildScopeCoverage(themeToSymbols, perfByInterval, livePrices, baseCharts) {
    const scopeSymbols = new Set();
    themeToSymbols.forEach((symbols) => {
        symbols.forEach((symbol) => scopeSymbols.add(symbol));
    });

    let coveredSymbols = 0;
    let livePriceSymbols = 0;
    let baseChartSymbols = 0;

    scopeSymbols.forEach((symbol) => {
        if (livePrices.has(symbol)) livePriceSymbols += 1;
        if (baseCharts.has(symbol)) baseChartSymbols += 1;
        const hasCoverage = SNAPSHOT_INTERVALS.some((interval) => perfByInterval.get(interval)?.has(symbol));
        if (hasCoverage) coveredSymbols += 1;
    });

    return {
        symbolCount: scopeSymbols.size,
        coverage: {
            coveredSymbols,
            livePriceSymbols,
            baseChartSymbols,
        }
    };
}

function buildScopeSnapshot(scope, themeToSymbols, perfByInterval, generatedAt, metrics) {
    return {
        version: SNAPSHOT_VERSION,
        generatedAt,
        scope,
        intervals: SNAPSHOT_INTERVALS,
        symbolCount: metrics.symbolCount,
        themeCount: themeToSymbols.size,
        coverage: metrics.coverage,
        heatmapData: aggregateHeatmap(themeToSymbols, perfByInterval),
    };
}

export async function buildMarketMapSnapshots() {
    const generatedAt = new Date().toISOString();
    const hierarchyData = buildHierarchyFromRawData(rawMarketData);
    const allMapping = buildThemeToSymbols(hierarchyData, { includeBse: true });
    const nseMapping = buildThemeToSymbols(hierarchyData, { includeBse: false });
    const allSymbols = [...new Set(allMapping.allSymbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean))].sort();

    const [livePrices, baseCharts] = await Promise.all([
        fetchLivePriceMap(allSymbols),
        fetchBaseChartSeriesMap(allSymbols),
    ]);

    const perfByInterval = new Map(SNAPSHOT_INTERVALS.map((interval) => [interval, new Map()]));

    allSymbols.forEach((symbol) => {
        const liveData = livePrices.get(symbol) || null;
        const baseSeries = baseCharts.get(symbol) || null;

        const oneDay = deriveOneDayPerf(liveData, baseSeries);
        if (oneDay) perfByInterval.get('1D').set(symbol, oneDay);

        ['5D', '1M', '3M', '6M', '1Y', 'YTD'].forEach((interval) => {
            const derived = deriveIntervalPerfFromBaseSeries(baseSeries, interval, liveData?.price);
            if (derived) perfByInterval.get(interval).set(symbol, derived);
        });

    });

    const allMetrics = buildScopeCoverage(allMapping.themeToSymbols, perfByInterval, livePrices, baseCharts);
    const nseMetrics = buildScopeCoverage(nseMapping.themeToSymbols, perfByInterval, livePrices, baseCharts);

    return {
        all: buildScopeSnapshot('all', allMapping.themeToSymbols, perfByInterval, generatedAt, allMetrics),
        nse: buildScopeSnapshot('nse', nseMapping.themeToSymbols, perfByInterval, generatedAt, nseMetrics),
    };
}

function getSnapshotKey(scope) {
    return `${SNAPSHOT_KEY_PREFIX}/${scope}.json`;
}

export async function storeMarketMapSnapshots(env) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.put !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const snapshots = await buildMarketMapSnapshots();

    await Promise.all(Object.entries(snapshots).map(([scope, snapshot]) =>
        bucket.put(getSnapshotKey(scope), JSON.stringify(snapshot), {
            httpMetadata: {
                contentType: 'application/json; charset=utf-8',
                cacheControl: SNAPSHOT_CACHE_CONTROL,
            },
            customMetadata: {
                generatedAt: snapshot.generatedAt,
                scope,
                version: String(SNAPSHOT_VERSION),
            }
        })
    ));

    return snapshots;
}

export async function readMarketMapSnapshot(env, scope) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getSnapshotKey(scope);
    const object = await bucket.get(key);
    if (!object) return null;

    const text = await object.text();
    const snapshot = JSON.parse(text);
    return {
        key,
        snapshot,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata || {},
    };
}
