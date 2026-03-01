import { useMemo, useCallback, useEffect } from 'react';
import { useAsync } from './useAsync';
import { fetchBatchIntervalPerformance, cleanSymbol, recordCacheMetric } from '../services/priceService';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];
const CACHE_TTL = 300_000; // 5 minutes
const RAW_DATA_KEY = 'tt_raw_price_data:v1';

// ─── Persistence Helpers ───────────────────────────────────────────

function loadPersistedRawData() {
    try {
        const raw = sessionStorage.getItem(RAW_DATA_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Date.now() - parsed.timestamp < CACHE_TTL) {
                // Convert plain objects back to Maps for our engine
                const cache = new Map();
                Object.keys(parsed.data).forEach(interval => {
                    cache.set(interval, new Map(Object.entries(parsed.data[interval])));
                });
                return { cache, timestamp: parsed.timestamp };
            }
        }
    } catch { /* ignore */ }
    return null;
}

function savePersistedRawData(cache, timestamp) {
    try {
        const dataToSave = {};
        cache.forEach((perfMap, interval) => {
            dataToSave[interval] = Object.fromEntries(perfMap);
        });
        sessionStorage.setItem(RAW_DATA_KEY, JSON.stringify({
            data: dataToSave,
            timestamp
        }));
    } catch { /* ignore */ }
}

// Module-level memory cache for instant tab switching
const initialPersisted = loadPersistedRawData();
let globalPriceDataCache = initialPersisted ? initialPersisted.cache : new Map();
let globalPriceDataTimestamp = initialPersisted ? initialPersisted.timestamp : 0;
const globalPriceCoverage = new Map();
const globalHeatmapByHierarchy = new WeakMap();

if (initialPersisted?.cache) {
    initialPersisted.cache.forEach((perfMap, interval) => {
        globalPriceCoverage.set(interval, new Set(perfMap.keys()));
    });
}

export function useThematicHeatmap(thematicMap, hierarchy) {
    const themeMappings = useMemo(() => {
        const themeToSymbols = new Map();
        const allSymbolsSet = new Set();
        if (!thematicMap || !hierarchy) return { themeToSymbols, allSymbols: [] };

        thematicMap.forEach(block => {
            block.themes.forEach(theme => {
                const symbols = new Set();
                if (theme.industries) {
                    theme.industries.forEach(indName => {
                        for (const sector in hierarchy) {
                            if (hierarchy[sector][indName]) {
                                hierarchy[sector][indName].forEach(c => {
                                    if (c.symbol) {
                                        symbols.add(c.symbol);
                                        allSymbolsSet.add(c.symbol);
                                    }
                                });
                                break;
                            }
                        }
                    });
                }
                if (theme.symbols) {
                    theme.symbols.forEach(s => {
                        symbols.add(s);
                        allSymbolsSet.add(s);
                    });
                }
                themeToSymbols.set(theme.name, Array.from(symbols));
            });
        });

        return {
            themeToSymbols,
            allSymbols: Array.from(allSymbolsSet)
        };
    }, [thematicMap, hierarchy]);

    const { themeToSymbols, allSymbols } = themeMappings;

    const fetchFunc = useCallback(async () => {
        if (allSymbols.length === 0) return {};

        const now = Date.now();
        const isCacheValid = (now - globalPriceDataTimestamp < CACHE_TTL);
        const normalizedSymbols = Array.from(new Set(allSymbols.map((symbol) => cleanSymbol(symbol))));

        const hasFullCoverage = HEATMAP_INTERVALS.every((interval) => {
            if (!globalPriceDataCache.has(interval)) return false;
            const coverage = globalPriceCoverage.get(interval);
            if (!coverage) return false;
            for (const symbol of normalizedSymbols) {
                if (!coverage.has(symbol)) return false;
            }
            return true;
        });

        if (isCacheValid && hierarchy && hasFullCoverage) {
            const cachedHeatmapEntry = globalHeatmapByHierarchy.get(hierarchy);
            if (cachedHeatmapEntry?.timestamp === globalPriceDataTimestamp) {
                recordCacheMetric('heatmapMemoHits');
                return cachedHeatmapEntry.heatmap;
            }
            recordCacheMetric('heatmapMemoMisses');
        }

        // 1. Fetch raw performance data for all unique symbols across intervals
        let wasRefetched = false;
        const results = await Promise.all(
            HEATMAP_INTERVALS.map(async (interval) => {
                const hasCacheForInterval = globalPriceDataCache.has(interval);
                const coverage = globalPriceCoverage.get(interval) || new Set();
                const missingSymbols = normalizedSymbols.filter((symbol) => !coverage.has(symbol));

                // Return cached raw data only if cache is valid and fully covers the current symbol universe.
                if (isCacheValid && hasCacheForInterval && missingSymbols.length === 0) {
                    recordCacheMetric('externalCacheHits');
                    return { interval, perfMap: globalPriceDataCache.get(interval) };
                }
                recordCacheMetric('externalCacheMisses');

                const symbolsToFetch = isCacheValid ? missingSymbols : normalizedSymbols;
                const fetchedPerf = symbolsToFetch.length > 0
                    ? await fetchBatchIntervalPerformance(symbolsToFetch, interval)
                    : new Map();

                const nextPerfMap = (isCacheValid && hasCacheForInterval)
                    ? new Map(globalPriceDataCache.get(interval))
                    : new Map();

                fetchedPerf.forEach((value, symbol) => {
                    nextPerfMap.set(symbol, value);
                });

                symbolsToFetch.forEach((symbol) => coverage.add(symbol));
                globalPriceCoverage.set(interval, coverage);
                globalPriceDataCache.set(interval, nextPerfMap);
                wasRefetched = true;
                return { interval, perfMap: nextPerfMap };
            })
        );

        if (wasRefetched) {
            globalPriceDataTimestamp = Date.now();
            savePersistedRawData(globalPriceDataCache, globalPriceDataTimestamp);
        }

        // 2. Perform aggregation (always runs to respect current filtering)
        const heatmap = {}; // themeName -> { interval -> avgPerf }

        themeToSymbols.forEach((symbols, themeName) => {
            heatmap[themeName] = {};
            results.forEach(({ interval, perfMap }) => {
                let sum = 0;
                let validCount = 0;
                symbols.forEach(s => {
                    const data = perfMap.get(cleanSymbol(s));
                    if (data && typeof data.changePct === 'number') {
                        sum += data.changePct;
                        validCount++;
                    }
                });
                heatmap[themeName][interval] = validCount > 0 ? (sum / validCount) : null;
            });
        });

        if (hierarchy) {
            globalHeatmapByHierarchy.set(hierarchy, {
                heatmap,
                timestamp: globalPriceDataTimestamp
            });
        }

        return heatmap;
    }, [allSymbols, hierarchy, themeToSymbols]);

    const { data: heatmapData, loading, execute } = useAsync(fetchFunc, [allSymbols, themeToSymbols]);

    useEffect(() => {
        if (!allSymbols.length) return;
        const timer = setInterval(execute, CACHE_TTL);
        return () => clearInterval(timer);
    }, [allSymbols, execute]);

    return {
        heatmapData: heatmapData || {},
        stockPerfMap: globalPriceDataCache,
        loading: loading && !heatmapData
    };
}
