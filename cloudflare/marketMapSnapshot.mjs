import rawMarketData from '../public/data.json' with { type: 'json' };
import { buildHierarchyFromRawData } from '../packages/core/src/market/hierarchy.ts';
import { calculateEMA } from '../packages/core/src/math/indicators.ts';
import { THEMATIC_MAP } from '../src/data/thematicMap.js';
import { RPC_CHART, RPC_PRICE } from '../src/lib/stealth.js';

const SNAPSHOT_VERSION = 4;
const CHART_SNAPSHOT_VERSION = 1;
const SNAPSHOT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD', '5Y', 'MAX'];
const CHART_SNAPSHOT_INTERVALS = ['1Y', 'MAX'];
const SNAPSHOT_KEY_PREFIX = 'market-map/snapshots';
const CHART_SNAPSHOT_KEY_PREFIX = 'market-map/chart-snapshots/cards';
const SNAPSHOT_MANIFEST_KEY_PREFIX = 'market-map/manifests';
const CHART_SNAPSHOT_MANIFEST_KEY_PREFIX = 'market-map/chart-snapshots/manifests/cards';
const REFRESH_STATE_KEY = 'market-map/refresh/state.json';
const REFRESH_PARTIAL_KEY_PREFIX = 'market-map/refresh/partials';
const REFRESH_STATE_VERSION = 1;
const REFRESH_THEME_SYMBOL_TARGET = 50;
const REFRESH_THEME_MAX_COUNT = 4;
const REFRESH_STALE_MS = 45 * 60 * 1000;
const PRICE_BATCH_SIZE = 500;
const CHART_BATCH_SIZE = 250;
const CHART_CONCURRENCY = 3;
const ONE_YEAR_CHART_WINDOW = 6;
const MAX_CHART_WINDOW = 8;
const SNAPSHOT_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=900';
const SNAPSHOT_IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
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

function extractWideChartSeriesFromFrame(payload) {
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

            const validateAbs = (val) => {
                const num = Number(val || 0);
                if (!(num > 0)) return close;
                if (close > 0 && num < close * 0.1) return close;
                return num;
            };

            const high = validateAbs(stats?.[3]);
            const low = validateAbs(stats?.[4]);
            const open = validateAbs(stats?.[5]);
            const volume = Number(point?.[2] || 0);

            return { time, close, open, high, low, volume };
        })
        .filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.close) && point.close > 0)
        .sort((a, b) => a.time - b.time);

    if (rawSeries.length === 0) return null;

    const lastRawClose = rawSeries[rawSeries.length - 1].close;
    const needsScaling = absolutePrice > 5 && lastRawClose > 0 && Math.abs(lastRawClose - absolutePrice) > absolutePrice * 0.5;
    const scaleFactor = needsScaling ? (absolutePrice / lastRawClose) : 1;

    const series = rawSeries.map((point) => ({
        time: point.time,
        close: point.close * scaleFactor,
        open: point.open * scaleFactor,
        high: point.high * scaleFactor,
        low: point.low * scaleFactor,
        volume: point.volume,
        price: point.close * scaleFactor,
    }));

    return {
        symbol: cleanSymbol(symbolInfo[0]),
        series,
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
    } else if (interval === 'MAX') {
        anchor = points[0]?.close ?? null;
    } else {
        const lookbackBars = {
            '5D': 5,
            '1M': 21,
            '3M': 63,
            '6M': 126,
            '1Y': 252,
            '5Y': 1260,
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

function buildThemeToCompanies(sourceHierarchy, { includeBse = true } = {}) {
    const industryMap = buildIndustryMap(sourceHierarchy);
    const themeToCompanies = new Map();
    const assigned = new Set();
    const allCompanies = new Map();

    const registerCompany = (themeName, rawSymbol, rawName = null) => {
        const symbol = cleanSymbol(rawSymbol);
        if (!symbol) return;
        if (!includeBse && isBseSymbol(symbol)) return;
        if (assigned.has(symbol)) return;
        assigned.add(symbol);
        if (!themeToCompanies.has(themeName)) themeToCompanies.set(themeName, []);
        const company = { symbol, name: rawName || symbol };
        themeToCompanies.get(themeName).push(company);
        allCompanies.set(symbol, company);
    };

    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!themeToCompanies.has(theme.name)) themeToCompanies.set(theme.name, []);
            (theme.symbols || []).forEach((symbol) => registerCompany(theme.name, symbol));
        });
    });

    THEMATIC_MAP.forEach((block) => {
        block.themes.forEach((theme) => {
            if (!themeToCompanies.has(theme.name)) themeToCompanies.set(theme.name, []);
            (theme.industries || []).forEach((industryName) => {
                const companies = industryMap[industryName] || [];
                companies.forEach((company) => registerCompany(theme.name, company?.symbol, company?.name));
            });
        });
    });

    const finalizedThemeToCompanies = new Map();
    themeToCompanies.forEach((companies, themeName) => {
        finalizedThemeToCompanies.set(
            themeName,
            companies
                .slice()
                .sort((a, b) => String(a.name || a.symbol).localeCompare(String(b.name || b.symbol)))
        );
    });

    return {
        themeToCompanies: finalizedThemeToCompanies,
        allSymbols: Array.from(allCompanies.keys()),
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
                JSON.stringify([[[null, [symbol, getExchange(symbol)]]], ONE_YEAR_CHART_WINDOW, null, null, null, null, null, 0]),
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

async function fetchOneYearWideChartSeriesMap(symbols) {
    const results = new Map();

    await runInChunks(symbols, CHART_BATCH_SIZE, async (chunk) => {
        try {
            const entries = chunk.map((symbol) => [
                RPC_CHART,
                JSON.stringify([[[null, [symbol, getExchange(symbol)]]], ONE_YEAR_CHART_WINDOW, null, null, null, null, null, 0]),
                null,
                'generic'
            ]);

            const text = await executeGoogleBatch(entries);
            parseAllFrames(text)
                .filter((frame) => frame.rpcId === RPC_CHART)
                .forEach((frame) => {
                    const extracted = extractWideChartSeriesFromFrame(frame.payload);
                    if (extracted) results.set(extracted.symbol, extracted.series);
                });
        } catch {
            // Best-effort snapshot generation.
        }
    }, CHART_CONCURRENCY);

    return results;
}

async function fetchMaxChartSeriesMap(symbols) {
    const results = new Map();

    await runInChunks(symbols, CHART_BATCH_SIZE, async (chunk) => {
        try {
            const entries = chunk.map((symbol) => [
                RPC_CHART,
                JSON.stringify([[[null, [symbol, getExchange(symbol)]]], MAX_CHART_WINDOW, null, null, null, null, null, 0]),
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

function aggregateHeatmap(themeToCompanies, perfByInterval) {
    const heatmapData = {};

    themeToCompanies.forEach((companies, themeName) => {
        const intervalMap = {};

        SNAPSHOT_INTERVALS.forEach((interval) => {
            const perfMap = perfByInterval.get(interval) || new Map();
            let sum = 0;
            let validCount = 0;

            companies.forEach((company) => {
                const symbol = company?.symbol;
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

function buildScopeCoverage(themeToCompanies, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals) {
    const scopeSymbols = new Set();
    themeToCompanies.forEach((companies) => {
        companies.forEach((company) => scopeSymbols.add(company.symbol));
    });

    let coveredSymbols = 0;
    let livePriceSymbols = 0;
    let oneYearBaseChartSymbols = 0;
    let maxBaseChartSymbols = 0;
    let technicalSymbols = 0;

    scopeSymbols.forEach((symbol) => {
        if (livePrices.has(symbol)) livePriceSymbols += 1;
        if (oneYearBaseCharts.has(symbol)) oneYearBaseChartSymbols += 1;
        if (maxBaseCharts.has(symbol)) maxBaseChartSymbols += 1;
        if (symbolTechnicals[symbol]) technicalSymbols += 1;
        const hasCoverage = SNAPSHOT_INTERVALS.some((interval) => perfByInterval.get(interval)?.has(symbol));
        if (hasCoverage) coveredSymbols += 1;
    });

    return {
        symbolCount: scopeSymbols.size,
        coverage: {
            coveredSymbols,
            livePriceSymbols,
            oneYearBaseChartSymbols,
            maxBaseChartSymbols,
            technicalSymbols,
        }
    };
}

function buildScopeSymbolPerf(themeToCompanies, perfByInterval) {
    const scopeSymbols = new Set();
    themeToCompanies.forEach((companies) => {
        companies.forEach((company) => scopeSymbols.add(company.symbol));
    });

    const symbolPerf = {};
    scopeSymbols.forEach((symbol) => {
        const intervalMap = {};
        SNAPSHOT_INTERVALS.forEach((interval) => {
            const data = perfByInterval.get(interval)?.get(symbol);
            intervalMap[interval] = typeof data?.changePct === 'number' && Number.isFinite(data.changePct)
                ? data.changePct
                : null;
        });
        symbolPerf[symbol] = intervalMap;
    });

    return symbolPerf;
}

function buildScopeSymbolQuotes(themeToCompanies, livePrices, perfByInterval) {
    const scopeSymbols = new Set();
    themeToCompanies.forEach((companies) => {
        companies.forEach((company) => scopeSymbols.add(company.symbol));
    });

    const symbolQuotes = {};
    scopeSymbols.forEach((symbol) => {
        const live = livePrices.get(symbol);
        const perf1D = perfByInterval.get('1D')?.get(symbol);
        const price = Number.isFinite(live?.price) ? live.price : (Number.isFinite(perf1D?.close) ? perf1D.close : null);
        const changePct = Number.isFinite(live?.changePct) ? live.changePct : (Number.isFinite(perf1D?.changePct) ? perf1D.changePct : null);
        const change = Number.isFinite(live?.change) ? live.change : null;
        const prevClose = Number.isFinite(live?.prevClose) ? live.prevClose : null;

        symbolQuotes[symbol] = {
            price: Number.isFinite(price) ? price : null,
            change: Number.isFinite(change) ? change : null,
            changePct: Number.isFinite(changePct) ? changePct : null,
            prevClose: Number.isFinite(prevClose) ? prevClose : null,
        };
    });

    return symbolQuotes;
}

function buildScopeSymbolTechnicals(themeToCompanies, symbolTechnicals) {
    const scopeSymbols = new Set();
    themeToCompanies.forEach((companies) => {
        companies.forEach((company) => scopeSymbols.add(company.symbol));
    });

    const scopedTechnicals = {};
    scopeSymbols.forEach((symbol) => {
        if (symbolTechnicals[symbol]) scopedTechnicals[symbol] = symbolTechnicals[symbol];
    });

    return scopedTechnicals;
}

function buildSymbolTechnicals(oneYearBaseCharts, livePrices) {
    const symbolTechnicals = {};

    oneYearBaseCharts.forEach((series, symbol) => {
        const prices = series
            .map((point) => Number(point?.close))
            .filter((value) => Number.isFinite(value) && value > 0);

        if (prices.length < 5) return;

        const lastBaseClose = prices[prices.length - 1];
        const livePrice = Number(livePrices.get(symbol)?.price);
        const currentPrice = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : lastBaseClose;
        if (!(currentPrice > 0)) return;

        const ema10 = calculateEMA(prices, 10);
        const ema21 = calculateEMA(prices, 21);
        const ema50 = calculateEMA(prices, 50);
        const ema150 = calculateEMA(prices, 150);
        const ema200 = calculateEMA(prices, 200);

        symbolTechnicals[symbol] = {
            above10EMA: ema10 !== null ? currentPrice > ema10 : null,
            above21EMA: ema21 !== null ? currentPrice > ema21 : null,
            above50EMA: ema50 !== null ? currentPrice > ema50 : null,
            above150EMA: ema150 !== null ? currentPrice > ema150 : null,
            above200EMA: ema200 !== null ? currentPrice > ema200 : null,
        };
    });

    return symbolTechnicals;
}

function buildThemeConstituents(themeToCompanies) {
    const themeConstituents = {};

    themeToCompanies.forEach((companies, themeName) => {
        themeConstituents[themeName] = companies.map((company) => ({
            symbol: company.symbol,
            name: company.name || company.symbol,
        }));
    });

    return themeConstituents;
}

function buildScopeSnapshot(scope, themeToCompanies, perfByInterval, livePrices, symbolTechnicals, generatedAt, metrics) {
    return {
        version: SNAPSHOT_VERSION,
        generatedAt,
        scope,
        intervals: SNAPSHOT_INTERVALS,
        symbolCount: metrics.symbolCount,
        themeCount: themeToCompanies.size,
        coverage: metrics.coverage,
        heatmapData: aggregateHeatmap(themeToCompanies, perfByInterval),
        themeConstituents: buildThemeConstituents(themeToCompanies),
        symbolPerf: buildScopeSymbolPerf(themeToCompanies, perfByInterval),
        symbolQuotes: buildScopeSymbolQuotes(themeToCompanies, livePrices, perfByInterval),
        symbolTechnicals: buildScopeSymbolTechnicals(themeToCompanies, symbolTechnicals),
    };
}

function buildThemeChartSnapshots(scope, themeToCompanies, chartSeriesBySymbol, generatedAt, interval = '1Y') {
    const chartSnapshots = new Map();
    const normalizedInterval = normalizeChartSnapshotInterval(interval);

    themeToCompanies.forEach((companies, themeName) => {
        const symbols = {};

        companies.forEach((company) => {
            const symbol = company?.symbol;
            const series = chartSeriesBySymbol.get(symbol);
            if (!symbol || !Array.isArray(series) || series.length < 2) return;

            symbols[symbol] = {
                name: company?.name || symbol,
                series,
            };
        });

        chartSnapshots.set(themeName, {
            version: CHART_SNAPSHOT_VERSION,
            generatedAt,
            scope,
            theme: themeName,
            interval: normalizedInterval,
            symbolCount: Object.keys(symbols).length,
            symbols,
        });
    });

    return chartSnapshots;
}

export async function buildMarketMapArtifacts() {
    const generatedAt = new Date().toISOString();
    const hierarchyData = buildHierarchyFromRawData(rawMarketData);
    const allMapping = buildThemeToCompanies(hierarchyData, { includeBse: true });
    const nseMapping = buildThemeToCompanies(hierarchyData, { includeBse: false });
    const allSymbols = [...new Set(allMapping.allSymbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean))].sort();

    const [livePrices, oneYearWideCharts, maxBaseCharts] = await Promise.all([
        fetchLivePriceMap(allSymbols),
        fetchOneYearWideChartSeriesMap(allSymbols),
        fetchMaxChartSeriesMap(allSymbols),
    ]);

    const oneYearBaseCharts = new Map();
    oneYearWideCharts.forEach((series, symbol) => {
        oneYearBaseCharts.set(symbol, series.map((point) => ({ time: point.time, close: point.close })));
    });

    const perfByInterval = new Map(SNAPSHOT_INTERVALS.map((interval) => [interval, new Map()]));
    const symbolTechnicals = buildSymbolTechnicals(oneYearBaseCharts, livePrices);

    allSymbols.forEach((symbol) => {
        const liveData = livePrices.get(symbol) || null;
        const oneYearSeries = oneYearBaseCharts.get(symbol) || null;
        const maxSeries = maxBaseCharts.get(symbol) || null;

        const oneDay = deriveOneDayPerf(liveData, oneYearSeries || maxSeries);
        if (oneDay) perfByInterval.get('1D').set(symbol, oneDay);

        ['5D', '1M', '3M', '6M', '1Y', 'YTD'].forEach((interval) => {
            const derived = deriveIntervalPerfFromBaseSeries(oneYearSeries, interval, liveData?.price);
            if (derived) perfByInterval.get(interval).set(symbol, derived);
        });

        ['5Y', 'MAX'].forEach((interval) => {
            const derived = deriveIntervalPerfFromBaseSeries(maxSeries, interval, liveData?.price);
            if (derived) perfByInterval.get(interval).set(symbol, derived);
        });

    });

    const allMetrics = buildScopeCoverage(allMapping.themeToCompanies, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals);
    const nseMetrics = buildScopeCoverage(nseMapping.themeToCompanies, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals);

    return {
        marketSnapshots: {
            all: buildScopeSnapshot('all', allMapping.themeToCompanies, perfByInterval, livePrices, symbolTechnicals, generatedAt, allMetrics),
            nse: buildScopeSnapshot('nse', nseMapping.themeToCompanies, perfByInterval, livePrices, symbolTechnicals, generatedAt, nseMetrics),
        },
        chartSnapshots: {
            all: {
                '1Y': buildThemeChartSnapshots('all', allMapping.themeToCompanies, oneYearWideCharts, generatedAt, '1Y'),
                MAX: buildThemeChartSnapshots('all', allMapping.themeToCompanies, maxBaseCharts, generatedAt, 'MAX'),
            },
            nse: {
                '1Y': buildThemeChartSnapshots('nse', nseMapping.themeToCompanies, oneYearWideCharts, generatedAt, '1Y'),
                MAX: buildThemeChartSnapshots('nse', nseMapping.themeToCompanies, maxBaseCharts, generatedAt, 'MAX'),
            },
        }
    };
}

export async function buildMarketMapSnapshots() {
    const artifacts = await buildMarketMapArtifacts();
    return artifacts.marketSnapshots;
}

function getSnapshotKey(scope) {
    return `${SNAPSHOT_KEY_PREFIX}/${scope}.json`;
}

function normalizeChartSnapshotInterval(interval) {
    return String(interval || '1Y').toUpperCase() === 'MAX' ? 'MAX' : '1Y';
}

function encodeThemeSnapshotKey(themeName) {
    const bytes = new TextEncoder().encode(String(themeName || ''));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getThemeChartSnapshotPath(scope, themeName, interval = '1Y') {
    const normalizedInterval = normalizeChartSnapshotInterval(interval);
    const encodedTheme = encodeThemeSnapshotKey(themeName);
    if (normalizedInterval === '1Y') {
        return `${scope}/${encodedTheme}`;
    }
    return `${scope}/${normalizedInterval}/${encodedTheme}`;
}

function getThemeChartSnapshotKey(scope, themeName, interval = '1Y') {
    return `${CHART_SNAPSHOT_KEY_PREFIX}/${getThemeChartSnapshotPath(scope, themeName, interval)}.json`;
}

function getSnapshotVersionKey(scope, versionId) {
    return `${SNAPSHOT_KEY_PREFIX}/${scope}/versions/${versionId}.json`;
}

function getSnapshotManifestKey(scope) {
    return `${SNAPSHOT_MANIFEST_KEY_PREFIX}/snapshots/${scope}/current.json`;
}

function getThemeChartSnapshotVersionKey(scope, themeName, versionId, interval = '1Y') {
    return `${CHART_SNAPSHOT_KEY_PREFIX}/${getThemeChartSnapshotPath(scope, themeName, interval)}/versions/${versionId}.json`;
}

function getThemeChartSnapshotManifestKey(scope, themeName, interval = '1Y') {
    return `${CHART_SNAPSHOT_MANIFEST_KEY_PREFIX}/${getThemeChartSnapshotPath(scope, themeName, interval)}/current.json`;
}

function getSnapshotBucket(env) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.put !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }
    return bucket;
}

function getRefreshPartialKey(jobId, scope, chunkIndex) {
    return `${REFRESH_PARTIAL_KEY_PREFIX}/${jobId}/${scope}/${chunkIndex}.json`;
}

async function readJsonObject(bucket, key) {
    const object = await bucket.get(key);
    if (!object) return null;
    return JSON.parse(await object.text());
}

async function putJsonObject(bucket, key, value, cacheControl = SNAPSHOT_CACHE_CONTROL, customMetadata = {}) {
    await bucket.put(key, JSON.stringify(value), {
        httpMetadata: {
            contentType: 'application/json; charset=utf-8',
            cacheControl,
        },
        customMetadata,
    });
}

function createSelectedThemeMap(themeToCompanies, themeNames) {
    const selected = new Map();
    themeNames.forEach((themeName) => {
        selected.set(themeName, themeToCompanies.get(themeName) || []);
    });
    return selected;
}

function buildRefreshPlan() {
    const hierarchyData = buildHierarchyFromRawData(rawMarketData);
    const allMapping = buildThemeToCompanies(hierarchyData, { includeBse: true });
    const nseMapping = buildThemeToCompanies(hierarchyData, { includeBse: false });
    const themeNames = Array.from(allMapping.themeToCompanies.keys());
    const chunks = [];
    let currentThemes = [];
    let currentSymbols = new Set();

    const flushChunk = () => {
        if (currentThemes.length === 0) return;
        chunks.push({
            index: chunks.length,
            themes: currentThemes,
            symbols: Array.from(currentSymbols).sort(),
        });
        currentThemes = [];
        currentSymbols = new Set();
    };

    themeNames.forEach((themeName) => {
        const companies = allMapping.themeToCompanies.get(themeName) || [];
        const themeSymbols = companies
            .map((company) => cleanSymbol(company?.symbol))
            .filter(Boolean);
        const nextSymbols = new Set([...currentSymbols, ...themeSymbols]);
        const wouldOverflowSymbols = currentThemes.length > 0 && nextSymbols.size > REFRESH_THEME_SYMBOL_TARGET;
        const wouldOverflowThemes = currentThemes.length >= REFRESH_THEME_MAX_COUNT;

        if (wouldOverflowSymbols || wouldOverflowThemes) {
            flushChunk();
        }

        currentThemes.push(themeName);
        themeSymbols.forEach((symbol) => currentSymbols.add(symbol));
    });

    flushChunk();

    return {
        allMapping,
        nseMapping,
        chunks,
    };
}

function buildChunkPerfMaps(symbols, livePrices, oneYearBaseCharts, maxBaseCharts) {
    const perfByInterval = new Map(SNAPSHOT_INTERVALS.map((interval) => [interval, new Map()]));

    symbols.forEach((symbol) => {
        const liveData = livePrices.get(symbol) || null;
        const oneYearSeries = oneYearBaseCharts.get(symbol) || null;
        const maxSeries = maxBaseCharts.get(symbol) || null;

        const oneDay = deriveOneDayPerf(liveData, oneYearSeries || maxSeries);
        if (oneDay) perfByInterval.get('1D').set(symbol, oneDay);

        ['5D', '1M', '3M', '6M', '1Y', 'YTD'].forEach((interval) => {
            const derived = deriveIntervalPerfFromBaseSeries(oneYearSeries, interval, liveData?.price);
            if (derived) perfByInterval.get(interval).set(symbol, derived);
        });

        ['5Y', 'MAX'].forEach((interval) => {
            const derived = deriveIntervalPerfFromBaseSeries(maxSeries, interval, liveData?.price);
            if (derived) perfByInterval.get(interval).set(symbol, derived);
        });
    });

    return perfByInterval;
}

function buildScopeChunkPartial(scope, selectedThemes, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals) {
    const metrics = buildScopeCoverage(selectedThemes, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals);
    return {
        scope,
        symbolCount: metrics.symbolCount,
        themeCount: selectedThemes.size,
        coverage: metrics.coverage,
        heatmapData: aggregateHeatmap(selectedThemes, perfByInterval),
        themeConstituents: buildThemeConstituents(selectedThemes),
        symbolPerf: buildScopeSymbolPerf(selectedThemes, perfByInterval),
        symbolQuotes: buildScopeSymbolQuotes(selectedThemes, livePrices, perfByInterval),
        symbolTechnicals: buildScopeSymbolTechnicals(selectedThemes, symbolTechnicals),
    };
}

async function writeScopeSnapshot(bucket, scope, snapshot, versionId) {
    const versionKey = getSnapshotVersionKey(scope, versionId);
    const manifestKey = getSnapshotManifestKey(scope);
    const manifest = {
        version: SNAPSHOT_VERSION,
        versionId,
        scope,
        generatedAt: snapshot.generatedAt,
        payloadKey: versionKey,
    };

    await Promise.all([
        putJsonObject(bucket, versionKey, snapshot, SNAPSHOT_IMMUTABLE_CACHE_CONTROL, {
            generatedAt: snapshot.generatedAt,
            scope,
            version: String(SNAPSHOT_VERSION),
            versionId,
        }),
        putJsonObject(bucket, manifestKey, manifest, SNAPSHOT_CACHE_CONTROL, {
            generatedAt: snapshot.generatedAt,
            scope,
            version: String(SNAPSHOT_VERSION),
            versionId,
            kind: 'manifest',
        }),
        putJsonObject(bucket, getSnapshotKey(scope), snapshot, SNAPSHOT_CACHE_CONTROL, {
            generatedAt: snapshot.generatedAt,
            scope,
            version: String(SNAPSHOT_VERSION),
            versionId,
        }),
    ]);
}

async function writeThemeChartSnapshots(bucket, scope, chartSnapshots, versionId) {
    const writes = Array.from(chartSnapshots.entries()).flatMap(([themeName, snapshot]) => {
        const interval = normalizeChartSnapshotInterval(snapshot?.interval);
        const versionKey = getThemeChartSnapshotVersionKey(scope, themeName, versionId, interval);
        const manifestKey = getThemeChartSnapshotManifestKey(scope, themeName, interval);
        const manifest = {
            version: CHART_SNAPSHOT_VERSION,
            versionId,
            scope,
            theme: themeName,
            interval,
            generatedAt: snapshot.generatedAt,
            payloadKey: versionKey,
        };

        return [
            putJsonObject(bucket, versionKey, snapshot, SNAPSHOT_IMMUTABLE_CACHE_CONTROL, {
                generatedAt: snapshot.generatedAt,
                scope,
                theme: themeName,
                interval,
                version: String(CHART_SNAPSHOT_VERSION),
                versionId,
            }),
            putJsonObject(bucket, manifestKey, manifest, SNAPSHOT_CACHE_CONTROL, {
                generatedAt: snapshot.generatedAt,
                scope,
                theme: themeName,
                interval,
                version: String(CHART_SNAPSHOT_VERSION),
                versionId,
                kind: 'manifest',
            }),
            putJsonObject(bucket, getThemeChartSnapshotKey(scope, themeName, interval), snapshot, SNAPSHOT_CACHE_CONTROL, {
                generatedAt: snapshot.generatedAt,
                scope,
                theme: themeName,
                interval,
                version: String(CHART_SNAPSHOT_VERSION),
                versionId,
            }),
        ];
    });

    await Promise.all(writes);
}

function createRefreshState({ source = 'manual' } = {}) {
    const { chunks } = buildRefreshPlan();
    const now = new Date().toISOString();
    return {
        version: REFRESH_STATE_VERSION,
        jobId: String(Date.now()),
        status: 'running',
        source,
        createdAt: now,
        updatedAt: now,
        generatedAt: now,
        versionId: String(Date.now()),
        chunkCount: chunks.length,
        nextChunkIndex: 0,
        lastError: null,
        completedAt: null,
    };
}

async function readRefreshState(bucket) {
    return readJsonObject(bucket, REFRESH_STATE_KEY);
}

async function writeRefreshState(bucket, state) {
    const nextState = {
        ...state,
        updatedAt: new Date().toISOString(),
    };
    await putJsonObject(bucket, REFRESH_STATE_KEY, nextState, 'no-store', {
        status: nextState.status,
        jobId: nextState.jobId,
        version: String(REFRESH_STATE_VERSION),
    });
    return nextState;
}

function isRefreshStateStale(state) {
    const updatedAt = Date.parse(state?.updatedAt || state?.createdAt || '');
    if (!Number.isFinite(updatedAt)) return true;
    return (Date.now() - updatedAt) > REFRESH_STALE_MS;
}

async function processRefreshChunk(bucket, state, chunkIndex) {
    const { allMapping, nseMapping, chunks } = buildRefreshPlan();
    const chunk = chunks[chunkIndex];
    if (!chunk) {
        throw new Error(`Market map refresh chunk ${chunkIndex} is out of range`);
    }

    const livePrices = await fetchLivePriceMap(chunk.symbols);
    const [oneYearWideCharts, maxBaseCharts] = await Promise.all([
        fetchOneYearWideChartSeriesMap(chunk.symbols),
        fetchMaxChartSeriesMap(chunk.symbols),
    ]);

    const oneYearBaseCharts = new Map();
    oneYearWideCharts.forEach((series, symbol) => {
        oneYearBaseCharts.set(symbol, series.map((point) => ({ time: point.time, close: point.close })));
    });

    const perfByInterval = buildChunkPerfMaps(chunk.symbols, livePrices, oneYearBaseCharts, maxBaseCharts);
    const symbolTechnicals = buildSymbolTechnicals(oneYearBaseCharts, livePrices);

    const allSelectedThemes = createSelectedThemeMap(allMapping.themeToCompanies, chunk.themes);
    const nseSelectedThemes = createSelectedThemeMap(nseMapping.themeToCompanies, chunk.themes);
    const allChartSnapshotsByInterval = {
        '1Y': buildThemeChartSnapshots('all', allSelectedThemes, oneYearWideCharts, state.generatedAt, '1Y'),
        MAX: buildThemeChartSnapshots('all', allSelectedThemes, maxBaseCharts, state.generatedAt, 'MAX'),
    };
    const nseChartSnapshotsByInterval = {
        '1Y': buildThemeChartSnapshots('nse', nseSelectedThemes, oneYearWideCharts, state.generatedAt, '1Y'),
        MAX: buildThemeChartSnapshots('nse', nseSelectedThemes, maxBaseCharts, state.generatedAt, 'MAX'),
    };

    await Promise.all([
        putJsonObject(bucket, getRefreshPartialKey(state.jobId, 'all', chunkIndex), buildScopeChunkPartial('all', allSelectedThemes, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals), SNAPSHOT_CACHE_CONTROL, {
            jobId: state.jobId,
            scope: 'all',
            chunkIndex: String(chunkIndex),
        }),
        putJsonObject(bucket, getRefreshPartialKey(state.jobId, 'nse', chunkIndex), buildScopeChunkPartial('nse', nseSelectedThemes, perfByInterval, livePrices, oneYearBaseCharts, maxBaseCharts, symbolTechnicals), SNAPSHOT_CACHE_CONTROL, {
            jobId: state.jobId,
            scope: 'nse',
            chunkIndex: String(chunkIndex),
        }),
        ...CHART_SNAPSHOT_INTERVALS.map((interval) => writeThemeChartSnapshots(bucket, 'all', allChartSnapshotsByInterval[interval], state.versionId)),
        ...CHART_SNAPSHOT_INTERVALS.map((interval) => writeThemeChartSnapshots(bucket, 'nse', nseChartSnapshotsByInterval[interval], state.versionId)),
    ]);
}

function mergeCoverageTotals(target, source) {
    target.coveredSymbols += Number(source?.coveredSymbols || 0);
    target.livePriceSymbols += Number(source?.livePriceSymbols || 0);
    target.oneYearBaseChartSymbols += Number(source?.oneYearBaseChartSymbols || 0);
    target.maxBaseChartSymbols += Number(source?.maxBaseChartSymbols || 0);
    target.technicalSymbols += Number(source?.technicalSymbols || 0);
}

async function finalizeRefreshState(bucket, state) {
    const mergedScopes = new Map();

    for (const scope of ['all', 'nse']) {
        const merged = {
            version: SNAPSHOT_VERSION,
            generatedAt: state.generatedAt,
            scope,
            intervals: SNAPSHOT_INTERVALS,
            symbolCount: 0,
            themeCount: 0,
            coverage: {
                coveredSymbols: 0,
                livePriceSymbols: 0,
                oneYearBaseChartSymbols: 0,
                maxBaseChartSymbols: 0,
                technicalSymbols: 0,
            },
            heatmapData: {},
            themeConstituents: {},
            symbolPerf: {},
            symbolQuotes: {},
            symbolTechnicals: {},
        };

        for (let chunkIndex = 0; chunkIndex < state.chunkCount; chunkIndex += 1) {
            const partial = await readJsonObject(bucket, getRefreshPartialKey(state.jobId, scope, chunkIndex));
            if (!partial) {
                throw new Error(`Missing ${scope} partial for chunk ${chunkIndex} in job ${state.jobId}`);
            }

            merged.symbolCount += Number(partial.symbolCount || 0);
            merged.themeCount += Number(partial.themeCount || 0);
            mergeCoverageTotals(merged.coverage, partial.coverage || {});
            Object.assign(merged.heatmapData, partial.heatmapData || {});
            Object.assign(merged.themeConstituents, partial.themeConstituents || {});
            Object.assign(merged.symbolPerf, partial.symbolPerf || {});
            Object.assign(merged.symbolQuotes, partial.symbolQuotes || {});
            Object.assign(merged.symbolTechnicals, partial.symbolTechnicals || {});
        }

        mergedScopes.set(scope, merged);
    }

    await Promise.all(Array.from(mergedScopes.entries()).map(([scope, snapshot]) =>
        writeScopeSnapshot(bucket, scope, snapshot, state.versionId)
    ));

    const partialKeys = [];
    for (const scope of ['all', 'nse']) {
        for (let chunkIndex = 0; chunkIndex < state.chunkCount; chunkIndex += 1) {
            partialKeys.push(getRefreshPartialKey(state.jobId, scope, chunkIndex));
        }
    }
    if (partialKeys.length > 0 && typeof bucket.delete === 'function') {
        await bucket.delete(partialKeys);
    }

    return {
        ...state,
        status: 'completed',
        completedAt: new Date().toISOString(),
        lastError: null,
    };
}

function getRefreshSelfUrl(env) {
    const configured = String(env?.MARKET_MAP_REFRESH_SELF_URL || '').trim();
    if (configured) return configured.replace(/\/+$/, '');
    return 'https://nexus.themetracker.workers.dev';
}

async function dispatchRefreshContinuation(env, payload) {
    const token = String(env?.MARKET_MAP_REFRESH_TOKEN || '').trim();
    if (!token) {
        throw new Error('MARKET_MAP_REFRESH_TOKEN secret is not configured');
    }

    const response = await fetch(`${getRefreshSelfUrl(env)}/api/internal/market-map-refresh`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to dispatch market map refresh continuation: ${response.status} ${body.slice(0, 200)}`);
    }
}

async function failRefreshState(bucket, state, error) {
    const failedState = {
        ...state,
        status: 'failed',
        completedAt: new Date().toISOString(),
        lastError: error?.message || 'Unknown error',
    };
    await writeRefreshState(bucket, failedState);
    return failedState;
}

export async function readMarketMapRefreshState(env) {
    const bucket = getSnapshotBucket(env);
    return readRefreshState(bucket);
}

export async function triggerMarketMapRefresh(env, options = {}) {
    const bucket = getSnapshotBucket(env);
    const { force = false, source = 'manual' } = options;
    let state = await readRefreshState(bucket);

    if (!force && state?.status === 'running' && !isRefreshStateStale(state)) {
        return state;
    }

    if (!force && state?.status === 'finalizing' && !isRefreshStateStale(state)) {
        return state;
    }

    state = createRefreshState({ source });
    return writeRefreshState(bucket, state);
}

export async function advanceMarketMapRefresh(env, options = {}) {
    const bucket = getSnapshotBucket(env);
    const { force = false, jobId = '', source = 'manual' } = options;
    let state = await readRefreshState(bucket);

    if (jobId && state?.jobId && state.jobId !== jobId) {
        return state;
    }

    if (!state || force || isRefreshStateStale(state) || state.status === 'failed' || state.status === 'completed') {
        if (jobId && state?.status === 'completed') {
            return state;
        }
        state = await triggerMarketMapRefresh(env, { force: true, source });
    }

    try {
        if (state.status === 'running' && state.nextChunkIndex < state.chunkCount) {
            const chunkIndex = state.nextChunkIndex;
            await processRefreshChunk(bucket, state, chunkIndex);
            state = await writeRefreshState(bucket, {
                ...state,
                status: chunkIndex + 1 >= state.chunkCount ? 'finalizing' : 'running',
                nextChunkIndex: chunkIndex + 1,
                lastError: null,
            });

            if (state.status !== 'completed' && state.nextChunkIndex <= state.chunkCount) {
                try {
                    await dispatchRefreshContinuation(env, {
                        jobId: state.jobId,
                        source: state.source,
                    });
                } catch (error) {
                    console.warn('Market map refresh continuation dispatch deferred', {
                        jobId: state.jobId,
                        nextChunkIndex: state.nextChunkIndex,
                        error: error?.message || 'Unknown error',
                    });
                    return writeRefreshState(bucket, {
                        ...state,
                        lastError: error?.message || 'Unknown error',
                    });
                }
            }

            return state;
        }

        if (state.status === 'finalizing') {
            state = await finalizeRefreshState(bucket, state);
            return writeRefreshState(bucket, state);
        }

        return state;
    } catch (error) {
        console.error('Market map refresh failed', {
            jobId: state?.jobId || '',
            status: state?.status || '',
            nextChunkIndex: state?.nextChunkIndex ?? null,
            error: error?.message || 'Unknown error',
        });
        return failRefreshState(bucket, state || createRefreshState({ source }), error);
    }
}

export async function storeMarketMapSnapshots(env) {
    const bucket = getSnapshotBucket(env);

    const { marketSnapshots, chartSnapshots } = await buildMarketMapArtifacts();
    const versionId = String(Date.now());

    const marketWrites = Object.entries(marketSnapshots).flatMap(([scope, snapshot]) => {
        const versionKey = getSnapshotVersionKey(scope, versionId);
        const manifestKey = getSnapshotManifestKey(scope);
        const manifest = {
            version: SNAPSHOT_VERSION,
            versionId,
            scope,
            generatedAt: snapshot.generatedAt,
            payloadKey: versionKey,
        };

        return [
            bucket.put(versionKey, JSON.stringify(snapshot), {
                httpMetadata: {
                    contentType: 'application/json; charset=utf-8',
                    cacheControl: SNAPSHOT_IMMUTABLE_CACHE_CONTROL,
                },
                customMetadata: {
                    generatedAt: snapshot.generatedAt,
                    scope,
                    version: String(SNAPSHOT_VERSION),
                    versionId,
                }
            }),
            bucket.put(manifestKey, JSON.stringify(manifest), {
                httpMetadata: {
                    contentType: 'application/json; charset=utf-8',
                    cacheControl: SNAPSHOT_CACHE_CONTROL,
                },
                customMetadata: {
                    generatedAt: snapshot.generatedAt,
                    scope,
                    version: String(SNAPSHOT_VERSION),
                    versionId,
                    kind: 'manifest',
                }
            }),
            // Legacy stable key retained for backward compatibility / manual inspection.
            bucket.put(getSnapshotKey(scope), JSON.stringify(snapshot), {
                httpMetadata: {
                    contentType: 'application/json; charset=utf-8',
                    cacheControl: SNAPSHOT_CACHE_CONTROL,
                },
                customMetadata: {
                    generatedAt: snapshot.generatedAt,
                    scope,
                    version: String(SNAPSHOT_VERSION),
                    versionId,
                }
            }),
        ];
    });

    const chartWrites = Object.entries(chartSnapshots).flatMap(([scope, snapshotsByInterval]) =>
        Object.values(snapshotsByInterval).flatMap((snapshots) =>
            Array.from(snapshots.entries()).flatMap(([themeName, snapshot]) => {
                const interval = normalizeChartSnapshotInterval(snapshot?.interval);
                const versionKey = getThemeChartSnapshotVersionKey(scope, themeName, versionId, interval);
                const manifestKey = getThemeChartSnapshotManifestKey(scope, themeName, interval);
            const manifest = {
                version: CHART_SNAPSHOT_VERSION,
                versionId,
                scope,
                theme: themeName,
                interval,
                generatedAt: snapshot.generatedAt,
                payloadKey: versionKey,
            };

            return [
                bucket.put(versionKey, JSON.stringify(snapshot), {
                    httpMetadata: {
                        contentType: 'application/json; charset=utf-8',
                        cacheControl: SNAPSHOT_IMMUTABLE_CACHE_CONTROL,
                    },
                    customMetadata: {
                        generatedAt: snapshot.generatedAt,
                        scope,
                        theme: themeName,
                        interval,
                        version: String(CHART_SNAPSHOT_VERSION),
                        versionId,
                    }
                }),
                bucket.put(manifestKey, JSON.stringify(manifest), {
                    httpMetadata: {
                        contentType: 'application/json; charset=utf-8',
                        cacheControl: SNAPSHOT_CACHE_CONTROL,
                    },
                    customMetadata: {
                        generatedAt: snapshot.generatedAt,
                        scope,
                        theme: themeName,
                        interval,
                        version: String(CHART_SNAPSHOT_VERSION),
                        versionId,
                        kind: 'manifest',
                    }
                }),
                // Legacy stable key retained for compatibility / manual inspection.
                bucket.put(getThemeChartSnapshotKey(scope, themeName, interval), JSON.stringify(snapshot), {
                    httpMetadata: {
                        contentType: 'application/json; charset=utf-8',
                        cacheControl: SNAPSHOT_CACHE_CONTROL,
                    },
                    customMetadata: {
                        generatedAt: snapshot.generatedAt,
                        scope,
                        theme: themeName,
                        interval,
                        version: String(CHART_SNAPSHOT_VERSION),
                        versionId,
                    }
                }),
            ];
            })
        )
    );

    await Promise.all([...marketWrites, ...chartWrites]);

    return marketSnapshots;
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

export async function readThemeChartSnapshot(env, scope, themeName, interval = '1Y') {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const normalizedInterval = normalizeChartSnapshotInterval(interval);
    const key = getThemeChartSnapshotKey(scope, themeName, normalizedInterval);
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

export async function readMarketMapSnapshotManifest(env, scope) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getSnapshotManifestKey(scope);
    const object = await bucket.get(key);
    if (!object) return null;

    const text = await object.text();
    const manifest = JSON.parse(text);
    return {
        key,
        manifest,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata || {},
    };
}

export async function readThemeChartSnapshotManifest(env, scope, themeName, interval = '1Y') {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const normalizedInterval = normalizeChartSnapshotInterval(interval);
    const key = getThemeChartSnapshotManifestKey(scope, themeName, normalizedInterval);
    const object = await bucket.get(key);
    if (!object) return null;

    const text = await object.text();
    const manifest = JSON.parse(text);
    return {
        key,
        manifest,
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata || {},
    };
}

export async function readMarketMapSnapshotVersion(env, scope, versionId) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getSnapshotVersionKey(scope, versionId);
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

export async function readThemeChartSnapshotVersion(env, scope, themeName, versionId, interval = '1Y') {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const normalizedInterval = normalizeChartSnapshotInterval(interval);
    const key = getThemeChartSnapshotVersionKey(scope, themeName, versionId, normalizedInterval);
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
