import { useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAsync } from './useAsync';
import { fetchBatchIntervalPerformance, cleanSymbol } from '../services/priceService';
import { THEMATIC_MAP, BlockDefinition } from '@core/market/thematicMap';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '6M', 'YTD'];
const CACHE_TTL = 300_000; // 5 minutes
const RAW_DATA_KEY = 'tt_raw_price_data:v1';

// Module-level memory cache for instant tab switching
let globalPriceDataCache = new Map<string, Map<string, number>>();
let globalPriceDataTimestamp = 0;
const globalPriceCoverage = new Map<string, Set<string>>();

async function loadPersistedRawData() {
    try {
        const raw = await AsyncStorage.getItem(RAW_DATA_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && Date.now() - parsed.timestamp < CACHE_TTL) {
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

async function savePersistedRawData(cache: Map<string, Map<string, number>>, timestamp: number) {
    try {
        const dataToSave: any = {};
        cache.forEach((perfMap, interval) => {
            dataToSave[interval] = Object.fromEntries(perfMap);
        });
        await AsyncStorage.setItem(RAW_DATA_KEY, JSON.stringify({
            data: dataToSave,
            timestamp
        }));
    } catch { /* ignore */ }
}

// Initialize from storage
loadPersistedRawData().then(initial => {
    if (initial) {
        globalPriceDataCache = initial.cache;
        globalPriceDataTimestamp = initial.timestamp;
        initial.cache.forEach((perfMap: Map<string, number>, interval: string) => {
            globalPriceCoverage.set(interval, new Set(perfMap.keys()));
        });
    }
});

export function useThematicHeatmap(hierarchy: any) {
    const thematicMap = THEMATIC_MAP;

    const themeMappings = useMemo(() => {
        const themeToSymbols = new Map<string, string[]>();
        const allSymbolsSet = new Set<string>();
        if (!thematicMap || !hierarchy) return { themeToSymbols, allSymbols: [] };

        thematicMap.forEach((block: BlockDefinition) => {
            block.themes.forEach(theme => {
                const symbols = new Set<string>();
                if (theme.industries) {
                    theme.industries.forEach(indName => {
                        for (const sector in hierarchy) {
                            if (hierarchy[sector][indName]) {
                                hierarchy[sector][indName].forEach((c: any) => {
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
    }, [hierarchy]);

    const { themeToSymbols, allSymbols } = themeMappings;

    const fetchFunc = useCallback(async () => {
        if (allSymbols.length === 0) return {};

        const now = Date.now();
        const isCacheValid = (now - globalPriceDataTimestamp < CACHE_TTL);
        const normalizedSymbols = Array.from(new Set(allSymbols.map((symbol) => cleanSymbol(symbol))));

        let wasRefetched = false;
        const results = await Promise.all(
            HEATMAP_INTERVALS.map(async (interval) => {
                const hasCacheForInterval = globalPriceDataCache.has(interval);
                const coverage = globalPriceCoverage.get(interval) || new Set();
                const missingSymbols = normalizedSymbols.filter((symbol) => !coverage.has(symbol));

                if (isCacheValid && hasCacheForInterval && missingSymbols.length === 0) {
                    return { interval, perfMap: globalPriceDataCache.get(interval)! };
                }

                const symbolsToFetch = isCacheValid ? missingSymbols : normalizedSymbols;
                const fetchedPerf = symbolsToFetch.length > 0
                    ? await fetchBatchIntervalPerformance(symbolsToFetch, interval)
                    : new Map();

                const nextPerfMap = (isCacheValid && hasCacheForInterval)
                    ? new Map(globalPriceDataCache.get(interval))
                    : new Map();

                fetchedPerf.forEach((value: any, symbol: string) => {
                    nextPerfMap.set(symbol, value.changePct);
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

        const heatmap: any = {};

        themeToSymbols.forEach((symbols, themeName) => {
            heatmap[themeName] = {};
            results.forEach(({ interval, perfMap }) => {
                let sum = 0;
                let validCount = 0;
                symbols.forEach(s => {
                    const val = perfMap.get(cleanSymbol(s));
                    if (typeof val === 'number') {
                        sum += val;
                        validCount++;
                    }
                });
                heatmap[themeName][interval] = validCount > 0 ? (sum / validCount) : null;
            });
        });

        return heatmap;
    }, [allSymbols, themeToSymbols]);

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
