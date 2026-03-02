import { useEffect, useMemo } from 'react';
import { cleanSymbol, getCachedIntervalEntry } from '../services/priceService';
import { useIntervalVersion, useMarketDataRegistry } from '../context/MarketDataContext';

const HEATMAP_INTERVALS = ['1D', '5D', '1M', '3M', '6M', '1Y', 'YTD'];

function buildHeatmap(themeToSymbols, intervalResults, themeNames) {
    const heatmap = {};
    const names = Array.isArray(themeNames) && themeNames.length > 0
        ? themeNames
        : Array.from(themeToSymbols.keys());

    names.forEach((themeName) => {
        const symbols = themeToSymbols.get(themeName);
        if (!symbols) return;
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

export function useThematicHeatmap(thematicMap, hierarchy, options = {}) {
    const { subscribeIntervalSymbols } = useMarketDataRegistry();
    const intervalVersion = useIntervalVersion();
    const activeThemeNames = Array.isArray(options?.activeThemeNames) ? options.activeThemeNames : [];
    const activeThemeList = useMemo(
        () => Array.from(new Set(activeThemeNames)),
        [activeThemeNames]
    );

    const themeMappings = useMemo(() => {
        const themeToSymbols = new Map();
        const allSymbolsSet = new Set();
        if (!thematicMap || !hierarchy) return { themeToSymbols, allSymbols: [] };

        thematicMap.forEach((block) => {
            block.themes.forEach((theme) => {
                const symbols = new Set();
                if (theme.industries) {
                    theme.industries.forEach((indName) => {
                        for (const sector in hierarchy) {
                            if (hierarchy[sector][indName]) {
                                hierarchy[sector][indName].forEach((c) => {
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
                    theme.symbols.forEach((symbol) => {
                        symbols.add(symbol);
                        allSymbolsSet.add(symbol);
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
    const activeSymbols = useMemo(() => {
        if (!activeThemeList.length) return allSymbols;
        const activeSet = new Set();
        activeThemeList.forEach((name) => {
            const symbols = themeToSymbols.get(name);
            if (symbols?.length) {
                symbols.forEach((sym) => activeSet.add(sym));
            }
        });
        return Array.from(activeSet);
    }, [activeThemeList, allSymbols, themeToSymbols]);
    const normalizedSymbols = useMemo(
        () => Array.from(new Set(activeSymbols.map((symbol) => cleanSymbol(symbol)).filter(Boolean))),
        [activeSymbols]
    );

    useEffect(() => {
        if (!normalizedSymbols.length) return;
        return subscribeIntervalSymbols(HEATMAP_INTERVALS, normalizedSymbols);
    }, [normalizedSymbols, subscribeIntervalSymbols]);

    const { heatmapData, stockPerfMap, intervalProgress, pendingIntervals } = useMemo(() => {
        const intervalResults = new Map();
        const progress = {};
        const pending = [];

        HEATMAP_INTERVALS.forEach((interval) => {
            const perfMap = new Map();
            let completedSymbols = 0;

            normalizedSymbols.forEach((symbol) => {
                const entry = getCachedIntervalEntry(symbol, interval, { silent: true });
                if (entry?.hasEntry) completedSymbols += 1;
                if (entry?.data && typeof entry.data.changePct === 'number') {
                    perfMap.set(symbol, entry.data);
                }
            });

            if (perfMap.size > 0) intervalResults.set(interval, perfMap);

            const totalSymbols = normalizedSymbols.length;
            const done = totalSymbols === 0 ? true : completedSymbols >= totalSymbols;
            progress[interval] = {
                interval,
                totalGroups: 0,
                completedGroups: 0,
                totalSymbols,
                completedSymbols,
                done
            };
            if (!done) pending.push(interval);
        });

        const heatmap = buildHeatmap(themeToSymbols, intervalResults, activeThemeList);
        return {
            heatmapData: heatmap,
            stockPerfMap: intervalResults,
            intervalProgress: progress,
            pendingIntervals: pending
        };
    }, [normalizedSymbols, themeToSymbols, intervalVersion, activeThemeList]);

    const loading = normalizedSymbols.length > 0 && !hasAnyHeatmapValues(heatmapData);

    return {
        heatmapData: heatmapData || {},
        stockPerfMap,
        loading,
        pendingIntervals,
        intervalProgress
    };
}
