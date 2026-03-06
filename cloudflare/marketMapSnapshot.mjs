import rawMarketData from '../public/data.json' with { type: 'json' };
import { buildHierarchyFromRawData } from '../packages/core/src/market/hierarchy.ts';
import { calculateEMA } from '../packages/core/src/math/indicators.ts';
import { THEMATIC_MAP } from '../src/data/thematicMap.js';
import { RPC_CHART, RPC_PRICE } from '../src/lib/stealth.js';

const SNAPSHOT_VERSION = 4;
const CHART_SNAPSHOT_VERSION = 1;
const SNAPSHOT_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD', '5Y', 'MAX'];
const SNAPSHOT_KEY_PREFIX = 'market-map/snapshots';
const CHART_SNAPSHOT_KEY_PREFIX = 'market-map/chart-snapshots/cards';
const SNAPSHOT_MANIFEST_KEY_PREFIX = 'market-map/manifests';
const CHART_SNAPSHOT_MANIFEST_KEY_PREFIX = 'market-map/chart-snapshots/manifests/cards';
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

function buildThemeChartSnapshots(scope, themeToCompanies, oneYearChartSeries, generatedAt) {
    const chartSnapshots = new Map();

    themeToCompanies.forEach((companies, themeName) => {
        const symbols = {};

        companies.forEach((company) => {
            const symbol = company?.symbol;
            const series = oneYearChartSeries.get(symbol);
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
            interval: '1Y',
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
            all: buildThemeChartSnapshots('all', allMapping.themeToCompanies, oneYearWideCharts, generatedAt),
            nse: buildThemeChartSnapshots('nse', nseMapping.themeToCompanies, oneYearWideCharts, generatedAt),
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

function encodeThemeSnapshotKey(themeName) {
    const bytes = new TextEncoder().encode(String(themeName || ''));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getThemeChartSnapshotKey(scope, themeName) {
    return `${CHART_SNAPSHOT_KEY_PREFIX}/${scope}/${encodeThemeSnapshotKey(themeName)}.json`;
}

function getSnapshotVersionKey(scope, versionId) {
    return `${SNAPSHOT_KEY_PREFIX}/${scope}/versions/${versionId}.json`;
}

function getSnapshotManifestKey(scope) {
    return `${SNAPSHOT_MANIFEST_KEY_PREFIX}/snapshots/${scope}/current.json`;
}

function getThemeChartSnapshotVersionKey(scope, themeName, versionId) {
    return `${CHART_SNAPSHOT_KEY_PREFIX}/${scope}/${encodeThemeSnapshotKey(themeName)}/versions/${versionId}.json`;
}

function getThemeChartSnapshotManifestKey(scope, themeName) {
    return `${CHART_SNAPSHOT_MANIFEST_KEY_PREFIX}/${scope}/${encodeThemeSnapshotKey(themeName)}/current.json`;
}

export async function storeMarketMapSnapshots(env) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.put !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

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

    const chartWrites = Object.entries(chartSnapshots).flatMap(([scope, snapshots]) =>
        Array.from(snapshots.entries()).flatMap(([themeName, snapshot]) => {
            const versionKey = getThemeChartSnapshotVersionKey(scope, themeName, versionId);
            const manifestKey = getThemeChartSnapshotManifestKey(scope, themeName);
            const manifest = {
                version: CHART_SNAPSHOT_VERSION,
                versionId,
                scope,
                theme: themeName,
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
                        interval: '1Y',
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
                        interval: '1Y',
                        version: String(CHART_SNAPSHOT_VERSION),
                        versionId,
                        kind: 'manifest',
                    }
                }),
                // Legacy stable key retained for compatibility / manual inspection.
                bucket.put(getThemeChartSnapshotKey(scope, themeName), JSON.stringify(snapshot), {
                    httpMetadata: {
                        contentType: 'application/json; charset=utf-8',
                        cacheControl: SNAPSHOT_CACHE_CONTROL,
                    },
                    customMetadata: {
                        generatedAt: snapshot.generatedAt,
                        scope,
                        theme: themeName,
                        interval: '1Y',
                        version: String(CHART_SNAPSHOT_VERSION),
                        versionId,
                    }
                }),
            ];
        })
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

export async function readThemeChartSnapshot(env, scope, themeName) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getThemeChartSnapshotKey(scope, themeName);
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

export async function readThemeChartSnapshotManifest(env, scope, themeName) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getThemeChartSnapshotManifestKey(scope, themeName);
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

export async function readThemeChartSnapshotVersion(env, scope, themeName, versionId) {
    const bucket = env?.MARKET_MAP_SNAPSHOTS;
    if (!bucket || typeof bucket.get !== 'function') {
        throw new Error('MARKET_MAP_SNAPSHOTS R2 binding is not configured');
    }

    const key = getThemeChartSnapshotVersionKey(scope, themeName, versionId);
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
