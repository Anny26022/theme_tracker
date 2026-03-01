import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { fetchBatchIntervalPerformance, cleanSymbol, recordCacheMetric } from '../services/priceService';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];
const HEATMAP_CACHE_TTL_MS = 300_000; // 5 minutes freshness budget
const HEATMAP_REFRESH_INTERVAL_MS = 240_000; // 4 minutes scheduled refresh
const RAW_DATA_KEY = 'tt_raw_price_data:v1';

// ─── Persistence Helpers ───────────────────────────────────────────

function loadPersistedRawData() {
    try {
        const raw = sessionStorage.getItem(RAW_DATA_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Date.now() - parsed.timestamp < HEATMAP_CACHE_TTL_MS) {
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

function buildHeatmap(themeToSymbols, intervalResults) {
    const heatmap = {};

    themeToSymbols.forEach((symbols, themeName) => {
        heatmap[themeName] = {};
        HEATMAP_INTERVALS.forEach((interval) => {
            const perfMap = intervalResults.get(interval);
            if (!perfMap) {
                heatmap[themeName][interval] = null;
                return;
            }

            let sum = 0;
            let validCount = 0;
            symbols.forEach((symbol) => {
                const data = perfMap.get(cleanSymbol(symbol));
                if (data && typeof data.changePct === 'number') {
                    sum += data.changePct;
                    validCount += 1;
                }
            });
            heatmap[themeName][interval] = validCount > 0 ? (sum / validCount) : null;
        });
    });

    return heatmap;
}

function hasAnyHeatmapValues(heatmap) {
    return Object.values(heatmap || {}).some((intervalMap) =>
        Object.values(intervalMap || {}).some((value) => Number.isFinite(value))
    );
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

    const [heatmapData, setHeatmapData] = useState({});
    const [loading, setLoading] = useState(false);
    const [intervalProgress, setIntervalProgress] = useState({});
    const requestIdRef = useRef(0);

    const execute = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        if (allSymbols.length === 0) {
            setHeatmapData({});
            setLoading(false);
            setIntervalProgress({});
            return {};
        }

        setLoading(true);

        const now = Date.now();
        const isCacheValid = (now - globalPriceDataTimestamp < HEATMAP_CACHE_TTL_MS);
        const normalizedSymbols = Array.from(new Set(allSymbols.map((symbol) => cleanSymbol(symbol))));
        const intervalResults = new Map();

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
                recordCacheMetric('heatmapFreshServes');
                if (requestId === requestIdRef.current) {
                    setHeatmapData(cachedHeatmapEntry.heatmap);
                    setLoading(false);
                    setIntervalProgress({});
                }
                return cachedHeatmapEntry.heatmap;
            }
            recordCacheMetric('heatmapMemoMisses');
        }

        // Seed UI with any already-available interval data to avoid full-screen blocking.
        HEATMAP_INTERVALS.forEach((interval) => {
            const existing = globalPriceDataCache.get(interval);
            if (existing) intervalResults.set(interval, existing);
        });

        if (requestId === requestIdRef.current) {
            // Always seed the UI shape immediately so MarketMap renders while data streams in.
            const seededHeatmap = buildHeatmap(themeToSymbols, intervalResults);
            setHeatmapData(seededHeatmap);
            if (hasAnyHeatmapValues(seededHeatmap)) setLoading(false);
        }

        // Fetch raw performance data across intervals and stream partial results.
        let wasRefetched = false;
        const intervalsToFetch = [];
        HEATMAP_INTERVALS.forEach((interval) => {
            const hasCacheForInterval = globalPriceDataCache.has(interval);
            const coverage = globalPriceCoverage.get(interval) || new Set();
            const missingSymbols = normalizedSymbols.filter((symbol) => !coverage.has(symbol));
            const shouldFetch = !(isCacheValid && hasCacheForInterval && missingSymbols.length === 0);
            if (shouldFetch) intervalsToFetch.push(interval);
        });
        if (requestId === requestIdRef.current) {
            const nextProgress = {};
            intervalsToFetch.forEach((interval) => {
                nextProgress[interval] = {
                    interval,
                    totalGroups: 0,
                    completedGroups: 0,
                    totalSymbols: 0,
                    completedSymbols: 0,
                    done: false
                };
            });
            setIntervalProgress(nextProgress);
        }

        await Promise.all(HEATMAP_INTERVALS.map(async (interval) => {
            const hasCacheForInterval = globalPriceDataCache.has(interval);
            const coverage = globalPriceCoverage.get(interval) || new Set();
            const missingSymbols = normalizedSymbols.filter((symbol) => !coverage.has(symbol));

            if (isCacheValid && hasCacheForInterval && missingSymbols.length === 0) {
                recordCacheMetric('externalCacheHits');
                intervalResults.set(interval, globalPriceDataCache.get(interval));
            } else {
                recordCacheMetric('externalCacheMisses');
                const symbolsToFetch = isCacheValid ? missingSymbols : normalizedSymbols;
                const nextPerfMap = (isCacheValid && hasCacheForInterval)
                    ? new Map(globalPriceDataCache.get(interval))
                    : new Map();
                intervalResults.set(interval, nextPerfMap);

                const fetchedPerf = symbolsToFetch.length > 0
                    ? await fetchBatchIntervalPerformance(symbolsToFetch, interval, {
                        onProgress: (progress) => {
                            if (requestId !== requestIdRef.current) return;
                            if (progress?.partialData && typeof progress.partialData === 'object') {
                                Object.entries(progress.partialData).forEach(([symbol, value]) => {
                                    if (value && typeof value.changePct === 'number') {
                                        nextPerfMap.set(symbol, value);
                                    }
                                });
                                globalPriceDataCache.set(interval, nextPerfMap);
                                const chunkHeatmap = buildHeatmap(themeToSymbols, intervalResults);
                                setHeatmapData(chunkHeatmap);
                                if (hasAnyHeatmapValues(chunkHeatmap)) setLoading(false);
                            }
                            setIntervalProgress((prev) => ({
                                ...prev,
                                [interval]: {
                                    ...(prev?.[interval] || {}),
                                    ...progress,
                                    done: Boolean(progress?.done)
                                }
                            }));
                        }
                    })
                    : new Map();

                fetchedPerf.forEach((value, symbol) => {
                    nextPerfMap.set(symbol, value);
                });

                symbolsToFetch.forEach((symbol) => coverage.add(symbol));
                globalPriceCoverage.set(interval, coverage);
                globalPriceDataCache.set(interval, nextPerfMap);
                intervalResults.set(interval, nextPerfMap);
                wasRefetched = true;
            }

            if (requestId !== requestIdRef.current) return;
            const partialHeatmap = buildHeatmap(themeToSymbols, intervalResults);
            setHeatmapData(partialHeatmap);
            if (hasAnyHeatmapValues(partialHeatmap)) setLoading(false);
        }));

        if (wasRefetched) {
            globalPriceDataTimestamp = Date.now();
            savePersistedRawData(globalPriceDataCache, globalPriceDataTimestamp);
        } else {
            recordCacheMetric('heatmapFreshServes');
        }

        const heatmap = buildHeatmap(themeToSymbols, intervalResults);

        if (hierarchy) {
            globalHeatmapByHierarchy.set(hierarchy, {
                heatmap,
                timestamp: globalPriceDataTimestamp
            });
        }

        if (requestId === requestIdRef.current) {
            setHeatmapData(heatmap);
            setLoading(false);
            setIntervalProgress({});
        }

        return heatmap;
    }, [allSymbols, hierarchy, themeToSymbols]);

    useEffect(() => {
        void execute();
        return () => {
            requestIdRef.current += 1;
            setIntervalProgress({});
        };
    }, [execute]);

    useEffect(() => {
        if (!allSymbols.length) return;
        const timer = setInterval(() => {
            recordCacheMetric('heatmapScheduledRefreshes');
            void execute();
        }, HEATMAP_REFRESH_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [allSymbols.length, execute]);

    const pendingIntervals = useMemo(
        () => Object.entries(intervalProgress)
            .filter(([, status]) => status && status.done !== true)
            .map(([interval]) => interval),
        [intervalProgress]
    );

    return {
        heatmapData: heatmapData || {},
        stockPerfMap: globalPriceDataCache,
        loading: loading && !hasAnyHeatmapValues(heatmapData),
        pendingIntervals,
        intervalProgress
    };
}
